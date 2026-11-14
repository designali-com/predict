import { createHash, randomBytes } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { biologicalAgeResult, biomarkerReading, contact, loginLink, patientRecord, session, user } from "./schema";
import type * as schema from "./schema";
import { placeholderEmailFor, visibleEmail } from "./placeholder-email";
import { toStoredPhone } from "./normalize-phone";

export { isPlaceholderEmail, placeholderEmailFor, visibleEmail } from "./placeholder-email";

type Db = NodePgDatabase<typeof schema>;

/**
 * Patient sign-in without typing anything: the clinic makes a link, sends it,
 * and opening it opens the dashboard.
 *
 * Also where a login is made for a patient who has only a mobile number.
 * better-auth needs an email on every account, so those get a placeholder on
 * a reserved domain (.invalid can never be a real mailbox). It is never shown
 * to the patient and never accepted as a sign-in email: the account is reached
 * by mobile + OTP, this link, or — once they set one in Settings — mobile +
 * password. Email sign-in starts only when they add a real address.
 */

export const LOGIN_LINK_DAYS = 7;
/** How long a staff "View dashboard" link lasts — long enough to open it, no longer. */
export const PREVIEW_LINK_MINUTES = 10;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Same shape as better-auth's own ids: 32 letters and digits. */
function newUserId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(32), (b) => alphabet[b % alphabet.length]).join("");
}

export type EnsureLoginResult =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; error: string };

/**
 * The chart's login, made now if it has none — from the chart's mobile, with
 * no password. The patient signs in by OTP or a link and sets a password
 * themselves in Settings if they want one.
 *
 * The chart's email is used only when it is free; otherwise the placeholder.
 * A number already on another account is refused rather than moved — moving
 * it would lock that person out of theirs.
 */
export async function ensurePatientLogin(db: Db, patientId: string): Promise<EnsureLoginResult> {
  const chart = await db.query.patientRecord.findFirst({ where: eq(patientRecord.id, patientId) });
  if (!chart) return { ok: false, error: "Patient not found" };
  if (chart.userId) return { ok: true, userId: chart.userId, created: false };

  const person = chart.contactId
    ? await db.query.contact.findFirst({ where: eq(contact.id, chart.contactId) })
    : null;
  const phone = toStoredPhone(person?.phone ?? chart.mobileNumber);
  if (!phone) return { ok: false, error: "This chart has no mobile number — add one first." };

  const holder = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.phoneNumber, phone),
  });
  if (holder) {
    const heldBy = await db.query.patientRecord.findFirst({
      columns: { id: true, patientCode: true },
      where: eq(patientRecord.userId, holder.id),
    });
    if (heldBy && heldBy.id !== chart.id) {
      return {
        ok: false,
        error: `This mobile number already signs in to patient ${heldBy.patientCode}. One number, one login.`,
      };
    }
    // An account with this number and no chart: it is this patient's.
    await link(db, chart.id, chart.contactId, holder.id);
    return { ok: true, userId: holder.id, created: false };
  }

  const chartEmail = (chart.email ?? person?.email ?? "").trim().toLowerCase() || null;
  const emailFree = chartEmail
    ? !(await db.query.user.findFirst({ columns: { id: true }, where: eq(user.email, chartEmail) }))
    : false;

  const id = newUserId();
  const now = new Date();
  await db.insert(user).values({
    id,
    name: [chart.firstName, chart.lastName].filter(Boolean).join(" ").trim() || person?.name || "Patient",
    email: emailFree && chartEmail ? chartEmail : placeholderEmailFor(phone),
    emailVerified: false,
    role: "patient",
    phoneNumber: phone,
    phoneNumberVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  await link(db, chart.id, chart.contactId, id);
  return { ok: true, userId: id, created: true };
}

async function link(db: Db, patientId: string, contactId: string | null, userId: string) {
  await db.update(patientRecord).set({ userId, updatedAt: new Date() }).where(eq(patientRecord.id, patientId));
  if (contactId) await db.update(contact).set({ userId }).where(eq(contact.id, contactId));
}

/**
 * Whether a patient's account is ready to be handed over.
 *
 * The sign-in link opens straight onto the dashboard, so it is only sent once
 * there is something true to show there: the blood values confirmed by staff
 * (readings are only saved after the upload's verify step, or typed in by
 * hand) and the biological age worked out from them. Sending it at
 * registration would open an empty dashboard — or one built from a report
 * nobody had checked yet.
 */
export async function patientSetupStatus(db: Db, patientId: string) {
  const chart = await db.query.patientRecord.findFirst({ where: eq(patientRecord.id, patientId) });
  if (!chart) return null;

  const person = chart.contactId
    ? await db.query.contact.findFirst({ columns: { phone: true }, where: eq(contact.id, chart.contactId) })
    : null;
  const [readings] = await db
    .select({ n: count() })
    .from(biomarkerReading)
    .where(eq(biomarkerReading.patientId, chart.id));
  const [ageResults] = await db
    .select({ n: count() })
    .from(biologicalAgeResult)
    .where(eq(biologicalAgeResult.patientId, chart.id));

  const hasMobile = Boolean(toStoredPhone(person?.phone ?? chart.mobileNumber));
  const readingCount = readings?.n ?? 0;
  const hasBiologicalAge = (ageResults?.n ?? 0) > 0;

  return {
    hasMobile,
    hasLogin: Boolean(chart.userId),
    readingCount,
    hasBiologicalAge,
    /** Everything the link opens onto is there. */
    ready: hasMobile && readingCount > 0 && hasBiologicalAge,
  };
}

/** Make a new link for this account. Any earlier live link stops working. */
export async function issueLoginLink(db: Db, input: { userId: string; createdByUserId: string | null }) {
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOGIN_LINK_DAYS * 24 * 60 * 60 * 1000);

  await revokeLoginLinks(db, input.userId);
  await db.insert(loginLink).values({
    userId: input.userId,
    tokenHash: hashToken(token),
    createdByUserId: input.createdByUserId,
    expiresAt,
    createdAt: now,
  });
  return { token, expiresAt };
}

export async function revokeLoginLinks(db: Db, userId: string) {
  await db
    .update(loginLink)
    .set({ revokedAt: new Date() })
    .where(and(eq(loginLink.userId, userId), isNull(loginLink.revokedAt)));
}

/**
 * A short link for staff to see the dashboard as the patient does ("View
 * dashboard"). It lasts minutes and leaves the patient's own link alone — the
 * one they were sent keeps working.
 */
export async function issuePreviewLink(db: Db, input: { userId: string; createdByUserId: string | null }) {
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  await db.insert(loginLink).values({
    userId: input.userId,
    tokenHash: hashToken(token),
    createdByUserId: input.createdByUserId,
    expiresAt: new Date(now.getTime() + PREVIEW_LINK_MINUTES * 60 * 1000),
    createdAt: now,
  });
  return { token };
}

/** The live link, if any — for the panel to show when it runs out and whether it was opened. */
export async function activeLoginLink(db: Db, userId: string) {
  const rows = await db.query.loginLink.findMany({
    where: and(eq(loginLink.userId, userId), isNull(loginLink.revokedAt), gt(loginLink.expiresAt, new Date())),
    orderBy: desc(loginLink.createdAt),
    limit: 10,
  });
  // A staff preview link lives minutes; the link the patient was sent lives days.
  const row = rows.find((r) => r.expiresAt.getTime() - r.createdAt.getTime() > 60 * 60 * 1000);
  if (!row) return null;
  return {
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    useCount: row.useCount,
  };
}

/**
 * Who a link signs in, if it still works. Every open is counted.
 *
 * One answer for every way a link can fail — unknown, revoked or expired all
 * send the patient to the login page with the same message.
 */
export async function redeemLoginLink(db: Db, token: string): Promise<{ userId: string } | null> {
  if (!token || token.length > 100) return null;
  const row = await db.query.loginLink.findFirst({ where: eq(loginLink.tokenHash, hashToken(token)) });
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;

  const account = await db.query.user.findFirst({
    columns: { id: true, banned: true },
    where: eq(user.id, row.userId),
  });
  if (!account || account.banned) return null;

  await db
    .update(loginLink)
    .set({ lastUsedAt: new Date(), useCount: row.useCount + 1 })
    .where(eq(loginLink.id, row.id));
  return { userId: row.userId };
}

/** The patient's login at a glance, for the clinic's app-access panel. */
export async function loginSummary(db: Db, userId: string) {
  const account = await db.query.user.findFirst({
    columns: { id: true, email: true, phoneNumber: true, banned: true, createdAt: true },
    where: eq(user.id, userId),
  });
  if (!account) return null;
  const [last] = await db
    .select({ at: session.createdAt })
    .from(session)
    .where(eq(session.userId, userId))
    .orderBy(desc(session.createdAt))
    .limit(1);
  return {
    phone: account.phoneNumber,
    /** A real address only — the .invalid placeholder is never shown. */
    email: visibleEmail(account.email),
    disabled: account.banned,
    createdAt: account.createdAt,
    lastSignInAt: last?.at ?? null,
  };
}

/**
 * Switch the patient's app access off or on. Off signs them out everywhere
 * and stops every way in (OTP, password, link) until it is switched back on;
 * nothing of theirs is deleted.
 */
export async function setAppAccess(db: Db, userId: string, enabled: boolean) {
  await db
    .update(user)
    .set(
      enabled
        ? { banned: false, banReason: null, banExpires: null, updatedAt: new Date() }
        : { banned: true, banReason: "App access switched off by the clinic", updatedAt: new Date() },
    )
    .where(eq(user.id, userId));
  if (!enabled) {
    await db.delete(session).where(eq(session.userId, userId));
    await revokeLoginLinks(db, userId);
  }
}

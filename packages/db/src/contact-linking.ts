import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import {
  appointment,
  clinicalFormSubmission,
  communicationMessage,
  contact,
  patientRecord,
  planEnrollment,
} from "./schema";
import type * as schema from "./schema";
import { toStoredPhone } from "./normalize-phone";

type Database = NodePgDatabase<typeof schema>;

/**
 * Joining a new login to the record the clinic already has.
 *
 * An offline patient is registered at the counter: a contact, a chart, a
 * patient code, and — once they buy a course — a log sheet of therapy days they
 * are meant to do at home. They have no login. When they later sign up on the
 * patient app they get a fresh user id, and nothing connected the two.
 *
 * The consequence was not subtle. /api/patient/therapy finds the patient with
 * `contact.userId = session.user.id`, so a patient halfway through a 42-day
 * course opened My Therapy and read "No therapy course yet" — with no way to
 * log the days they were doing at home, which is the entire point of sending
 * the medicine home with them.
 *
 * Worse, the moment they typed their mobile number into their profile — the one
 * moment we could have matched them — the old code created a SECOND contact,
 * hit the unique index on contact.phone, caught the error and logged it. The
 * match failed at exactly the point the evidence arrived.
 *
 * The phone number is the join. contact.phone is uniquely indexed and is what
 * every other path already deduplicates on, so it resolves to one person or
 * nobody.
 */

export type ClaimOutcome =
  | "claimed"
  | "already-linked"
  | "no-match"
  | "invalid-phone"
  | "belongs-to-another-account"
  | "needs-merge";

export interface ClaimResult {
  outcome: ClaimOutcome;
  /** The chart this account now reaches — their patient code lives on it. */
  patientId?: string | null;
  /** The contact this account is now attached to, when there is one. */
  contactId: string | null;
  /** Set on needs-merge: the other record a person has to reconcile. */
  duplicateContactId?: string;
}

/** Anything that makes a contact worth keeping rather than deleting. */
async function hasHistory(db: Database, contactId: string): Promise<boolean> {
  const [row] = await db
    .select({
      n: sql<number>`(
        (select count(*) from ${appointment} where ${appointment.contactId} = ${contactId}) +
        (select count(*) from ${planEnrollment} where ${planEnrollment.contactId} = ${contactId}) +
        (select count(*) from ${communicationMessage} where ${communicationMessage.contactId} = ${contactId}) +
        (select count(*) from ${clinicalFormSubmission} where ${clinicalFormSubmission.contactId} = ${contactId})
      )::int`,
    })
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);

  return (row?.n ?? 0) > 0;
}

/**
 * Attach this account to the contact holding this phone number.
 *
 * Refuses rather than guesses in the two cases where guessing would be wrong:
 * a number already belonging to a different account, and an account that has
 * built up history of its own on a second contact. Both need a person, and
 * silently merging either would move somebody's medical record.
 */
export async function claimContactByPhone(
  db: Database,
  params: { userId: string; phone: string; name?: string | null; email?: string | null },
): Promise<ClaimResult> {
  const phone = toStoredPhone(params.phone);
  if (!phone) return { outcome: "invalid-phone", contactId: null };

  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(contact).where(eq(contact.phone, phone)).limit(1);

    if (!target) return { outcome: "no-match" as const, contactId: null };
    if (target.userId === params.userId) {
      return { outcome: "already-linked" as const, contactId: target.id };
    }
    if (target.userId && target.userId !== params.userId) {
      // Somebody else's record. This happens with a shared family number, and
      // handing one person another's chart is not a thing to do automatically.
      return { outcome: "belongs-to-another-account" as const, contactId: null };
    }

    // A placeholder contact this account may already have picked up — created
    // by getOrCreateContactForUser the first time it needed a contactId.
    const [existing] = await tx
      .select()
      .from(contact)
      .where(and(eq(contact.userId, params.userId), ne(contact.id, target.id)))
      .limit(1);

    if (existing) {
      if (await hasHistory(tx as unknown as Database, existing.id)) {
        // Two real records for one person. Merging them means moving
        // appointments, courses and messages, and picking which chart wins —
        // a decision with a patient's history in it, so it goes to a human.
        return {
          outcome: "needs-merge" as const,
          contactId: target.id,
          duplicateContactId: existing.id,
        };
      }
      // Empty placeholder: nothing to lose, and leaving it would keep the
      // unique index on userId from letting the real record be claimed.
      await tx.delete(contact).where(eq(contact.id, existing.id));
    }

    await tx
      .update(contact)
      .set({
        userId: params.userId,
        // Fill blanks only. What the clinic recorded at the counter beats what
        // somebody typed into a signup form.
        name: target.name ?? params.name ?? null,
        email: target.email ?? params.email ?? null,
        updatedAt: new Date(),
      })
      .where(eq(contact.id, target.id));

    // And the chart. Linking the contact alone was half a fix: everything the
    // patient app shows — biomarkers, reports, biological age, wearables — is
    // keyed on patient_record.userId, so a patient whose contact was claimed
    // still opened a dashboard with no chart behind it.
    //
    // Only when the chart is unclaimed. One already attached to another
    // account is somebody else's medical record.
    const [chart] = await tx
      .select({ id: patientRecord.id, userId: patientRecord.userId })
      .from(patientRecord)
      .where(eq(patientRecord.contactId, target.id))
      .limit(1);

    if (chart && !chart.userId) {
      await tx
        .update(patientRecord)
        .set({ userId: params.userId, updatedAt: new Date() })
        .where(and(eq(patientRecord.id, chart.id), isNull(patientRecord.userId)));
    }

    return { outcome: "claimed" as const, contactId: target.id, patientId: chart?.id ?? null };
  });
}

/**
 * The same, by email, for a signup where no phone was given.
 *
 * Weaker than the phone match and used only as a fallback: a clinic often has
 * only a mobile number for a walk-in, and two people can share an email far
 * more plausibly than they share a mobile.
 */
export async function claimContactByEmail(
  db: Database,
  params: { userId: string; email: string },
): Promise<ClaimResult> {
  const email = params.email.trim().toLowerCase();
  if (!email) return { outcome: "no-match", contactId: null };

  const [target] = await db
    .select()
    .from(contact)
    .where(and(eq(contact.email, email), isNull(contact.userId)))
    .limit(1);

  if (!target) return { outcome: "no-match", contactId: null };

  await db
    .update(contact)
    .set({ userId: params.userId, updatedAt: new Date() })
    .where(and(eq(contact.id, target.id), isNull(contact.userId)));

  return { outcome: "claimed", contactId: target.id };
}

/** Everything this account can see, once linked. Null when it is not. */
export async function contactIdForUser(db: Database, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(eq(contact.userId, userId))
    .limit(1);
  return row?.id ?? null;
}

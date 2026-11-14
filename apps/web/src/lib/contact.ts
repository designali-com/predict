import { db } from "@workspace/db/client";
import { contact, user } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { toStoredPhone } from "@workspace/db/normalize-phone";
import { claimContactByPhone } from "@workspace/db/contact-linking";
import { predictClinicId } from "@workspace/db/clinic-service";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Called right after a user registers. Looks up an existing contact by phone
 * first, then normalized email (dedup) — e.g. one created earlier from a
 * landing-page lead form — and links onto that same row instead of creating
 * a second one, so message/flow history from the lead stage isn't lost.
 * Phone is checked first because `contact.phone` is uniquely indexed: if a
 * lead's phone already exists on a different row than the email being
 * registered with, inserting a fresh contact would violate that constraint.
 * Falls back to creating a fresh contact if none exists yet.
 */
export async function upsertContactForRegisteredUser(params: {
  userId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  source?: string;
}) {
  const email = normalizeEmail(params.email);
  // Same stored shape as every other write path, so the unique index on
  // contact.phone can actually dedupe and inbound WhatsApp can match.
  const phone = toStoredPhone(params.phone) ?? undefined;
  const predictClinic = await predictClinicId(db);

  return db.transaction(async (tx) => {
    let existing;
    if (phone) {
      [existing] = await tx.select().from(contact).where(eq(contact.phone, phone)).limit(1);
    }
    if (!existing) {
      [existing] = await tx.select().from(contact).where(eq(contact.email, email)).limit(1);
    }

    const now = new Date();
    let row;

    if (existing) {
      [row] = await tx
        .update(contact)
        .set({
          userId: params.userId,
          stage: "PATIENT",
          name: existing.name ?? params.name ?? null,
          phone: existing.phone ?? phone ?? null,
          email: existing.email ?? email ?? null,
          // A number we had only broadcast to, now signing up: an enquiry.
          ...(existing.stage === "AUDIENCE" ? { stage: "LEAD", leadStatus: "NEW", leadStatusAt: now } : {}),
          lastTouchAt: now,
          updatedAt: now,
        })
        .where(eq(contact.id, existing.id))
        .returning();
    } else {
      [row] = await tx
        .insert(contact)
        .values({
          name: params.name ?? null,
          email,
          phone: phone ?? null,
          userId: params.userId,
          stage: "PATIENT",
          source: params.source ?? "PREDICT",
          // Somebody new on the predict.fit app is Predict's patient. An
          // existing contact (an OPTM lead signing up) keeps their clinic.
          clinicId: predictClinic,
          firstTouchAt: now,
          lastTouchAt: now,
        })
        .returning();
    }

    if (!row) {
      throw new Error("Failed to upsert contact");
    }

    await emitDomainEvent(
      tx,
      DomainEventType.PATIENT_REGISTERED,
      { userId: params.userId, contactId: row.id },
      {
        contactId: row.id,
        idempotencyKey: `patient_registered:${params.userId}`,
      },
    );

    return row;
  });
}

export interface CaptureLeadParams {
  name?: string;
  phone?: string;
  email?: string;
  source?: string;
  sourcePlatform?: string;
  campaign?: string;
  campaignId?: string;
  referralCode?: string;
}

/**
 * The actual top of the funnel — a visitor submitting the landing-page
 * form. Dedups by phone then email against any existing contact (e.g. one
 * already converted to PATIENT) instead of creating a second row; an
 * already-converted contact's status is never downgraded back to LEAD by a
 * later form touch.
 */
export async function captureLead(params: CaptureLeadParams) {
  if (!params.phone && !params.email) {
    throw new Error("phone or email is required");
  }
  const email = params.email ? normalizeEmail(params.email) : undefined;
  const phone = toStoredPhone(params.phone) ?? undefined;

  return db.transaction(async (tx) => {
    let existing;
    if (phone) {
      [existing] = await tx.select().from(contact).where(eq(contact.phone, phone)).limit(1);
    }
    if (!existing && email) {
      [existing] = await tx.select().from(contact).where(eq(contact.email, email)).limit(1);
    }

    const now = new Date();
    let row;

    if (existing) {
      [row] = await tx
        .update(contact)
        .set({
          name: existing.name ?? params.name ?? null,
          phone: existing.phone ?? phone ?? null,
          email: existing.email ?? email ?? null,
          lastTouchAt: now,
          updatedAt: now,
        })
        .where(eq(contact.id, existing.id))
        .returning();
    } else {
      [row] = await tx
        .insert(contact)
        .values({
          name: params.name ?? null,
          phone: phone ?? null,
          email: email ?? null,
          stage: "LEAD",
          source: params.source ?? "PREDICT",
          sourcePlatform: params.sourcePlatform,
          campaign: params.campaign,
          campaignId: params.campaignId,
          referralCode: params.referralCode,
          firstTouchAt: now,
          lastTouchAt: now,
        })
        .returning();
    }

    if (!row) {
      throw new Error("Failed to capture lead");
    }

    await emitDomainEvent(tx, DomainEventType.LEAD_CAPTURED, { contactId: row.id }, {
      contactId: row.id,
    });

    return row;
  });
}

/**
 * Some user rows never went through registerUser (e.g. staff-created
 * accounts via the superadmin panel) and so have no linked contact yet.
 * Used by staff-initiated actions (like sending a manual message) that need
 * a contactId but shouldn't fail just because the contact backfill hasn't
 * happened for that user.
 */
export async function getOrCreateContactForUser(userId: string) {
  const [existingByUser] = await db
    .select()
    .from(contact)
    .where(eq(contact.userId, userId))
    .limit(1);
  if (existingByUser) return existingByUser;

  const [userRow] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!userRow) throw new Error(`User ${userId} not found`);

  return upsertContactForRegisteredUser({
    userId: userRow.id,
    email: userRow.email,
    name: userRow.name,
  });
}

/**
 * `patientRecord.mobileNumber` and `contact.phone` are two separate
 * columns with no foreign-key relationship — nothing keeps them in sync
 * automatically. Call this any time a phone number is saved anywhere
 * (patient's own profile page, staff editing a patient) so the automation
 * dashboard's audience/messaging features actually have a number to send
 * to. Safe no-op if the number is unchanged.
 */
export async function syncContactPhoneForUser(
  userId: string,
  phone: string | null | undefined,
) {
  const normalized = toStoredPhone(phone);

  // Claim first. This is the moment the patient tells us their number, and
  // for anyone registered at the counter it is the only thing that can match
  // their new login to the record the clinic already holds — the chart, the
  // course, and the at-home therapy days they are meant to be logging.
  //
  // The old order did the opposite: it created a contact for the account,
  // then tried to write the phone onto it, hit the unique index because the
  // clinic already had that number, caught the error and logged it. The match
  // failed at exactly the point the evidence arrived.
  if (normalized) {
    const claim = await claimContactByPhone(db, { userId, phone: normalized });
    if (claim.outcome === "claimed" || claim.outcome === "already-linked") {
      const [row] = await db.select().from(contact).where(eq(contact.id, claim.contactId!)).limit(1);
      if (row) return row;
    }
    if (claim.outcome === "needs-merge" || claim.outcome === "belongs-to-another-account") {
      // Deliberately not merged here: both cases move somebody's medical
      // history and need a person to decide. The account keeps its own
      // contact and the number is left alone rather than stolen.
      console.warn(
        `[contact] phone ${normalized} not linked to user ${userId}: ${claim.outcome}`,
        claim.duplicateContactId ? `duplicate: ${claim.duplicateContactId}` : "",
      );
      return getOrCreateContactForUser(userId);
    }
  }

  // Nobody else has this number — the ordinary case for a patient who found us
  // online. Their own contact simply takes it.
  const contactRow = await getOrCreateContactForUser(userId);
  if (contactRow.phone === normalized) return contactRow;

  const [updated] = await db
    .update(contact)
    .set({ phone: normalized, updatedAt: new Date() })
    .where(eq(contact.id, contactRow.id))
    .returning();

  return updated ?? contactRow;
}

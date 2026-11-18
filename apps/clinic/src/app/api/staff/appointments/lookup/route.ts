import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, patientRecord, user } from "@workspace/db/schema";
import { and, eq, isNull, or, sql } from "@workspace/db";
import { normalizePhone } from "@workspace/db/normalize-phone";
import { deskAnswerFor } from "@workspace/db/front-desk";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

/**
 * Who is this number?
 *
 * The booking form used to ask that question the other way round — pick
 * "existing patient" or "walk-in" first, then search — which asks the person
 * at the desk to know the answer before they have looked. A phone number is
 * the one thing a caller always gives, and it is the field both a patient
 * record and a lead are deduplicated on, so it can answer for itself.
 *
 * Three outcomes: a registered patient, a contact we have seen before but who
 * has no account yet, or nobody.
 *
 * Whoever is found comes back with `desk`: what they are actually here for.
 * A course plans every one of its days on a date when it is activated, so
 * "day 9 of 21, due today" is a fact the clinic has had for weeks. Asking the
 * patient "therapy or consultation?" was asking them to repeat it back.
 */
export async function GET(request: NextRequest) {
  const context = await requireClinicApiPermission("clinic.appointments");
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get("phone")?.trim() ?? "";
  const normalized = normalizePhone(raw);

  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error ?? "Not a phone number" }, { status: 400 });
  }

  const phone = normalized.phone;
  const clinicId = context.clinic.id;

  // The contact row is the one place every route into the clinic converges —
  // walk-in, WhatsApp lead, campaign, self sign-up — so it is what to search.
  // Only this clinic's contacts, plus the unstamped ones from before clinics
  // existed: a number on another clinic's books is "nobody" from here.
  const [row] = await db
    .select({
      contactId: contact.id,
      contactName: contact.name,
      contactEmail: contact.email,
      stage: contact.stage,
      userId: contact.userId,
      userName: user.name,
      userEmail: user.email,
    })
    .from(contact)
    .leftJoin(user, eq(user.id, contact.userId))
    .where(
      and(eq(contact.phone, phone), or(eq(contact.clinicId, clinicId), isNull(contact.clinicId))),
    )
    .limit(1);

  // Everything below reports the same `desk` answer, so the front desk gets
  // the same sentence whether this number belongs to a registered patient, an
  // old lead, or a chart nobody linked up.
  const desk = row?.contactId ? await deskAnswerFor(db, row.contactId) : null;

  if (row?.userId) {
    return NextResponse.json({
      phone,
      match: "patient",
      contactId: row.contactId,
      desk,
      patient: {
        id: row.userId,
        name: row.userName ?? row.contactName ?? "Unknown",
        email: row.userEmail ?? row.contactEmail ?? "",
      },
      stage: row.stage,
    });
  }

  // No contact, or a contact that was never linked to an account. Either way
  // there may still be a patient registered on this mobile — records created
  // before contacts existed, and contacts created by a campaign or webhook
  // that nobody has linked up since, both look like this.
  const [record] = await db
    .select({ userId: patientRecord.userId, name: user.name, email: user.email })
    .from(patientRecord)
    .innerJoin(user, eq(user.id, patientRecord.userId))
    .where(
      and(
        eq(patientRecord.mobileNumber, phone),
        // Same rule for a chart: its patient is on this clinic's books (or an
        // unstamped one), or has no contact at all yet.
        or(
          sql`exists (select 1 from "contact" where "user_id" = ${patientRecord.userId} and ("clinic_id" = ${clinicId} or "clinic_id" is null))`,
          sql`not exists (select 1 from "contact" where "user_id" = ${patientRecord.userId})`,
        ),
      ),
    )
    .limit(1);

  if (record?.userId) {
    return NextResponse.json({
      phone,
      match: "patient",
      patient: { id: record.userId, name: record.name, email: record.email },
      contactId: row?.contactId ?? null,
      desk,
      stage: row?.stage,
    });
  }

  if (!row) return NextResponse.json({ phone, match: "none" });

  return NextResponse.json({
    phone,
    match: "lead",
    lead: { name: row.contactName, email: row.contactEmail },
    contactId: row.contactId,
    desk,
    stage: row.stage,
  });
}

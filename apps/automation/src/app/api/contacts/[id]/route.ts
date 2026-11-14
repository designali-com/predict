import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, contactCommunicationPreference, leadSubmission, user } from "@workspace/db/schema";
import { canSeeLead, leadScope } from "@/src/lib/lead-access";
import { sideForStage } from "@workspace/db/contact-side";
import { promoteToLead } from "@workspace/db/lead-promotion";
import { desc, eq } from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { ContactEngagement } from "@workspace/db/contact-stage";
import { requireClinicAnyPermission } from "@/src/lib/auth/clinic";
import { OPS_KEYS } from "@workspace/db/permissions";
import { clinicModules } from "@workspace/db/clinic-modules";
import { sql } from "@workspace/db";

/** A diagnosis clinic may open another clinic's patient who is tested, referred or has a test ordered. */
async function diagnosisMayOpen(clinic: { modules?: string[] | null; kind?: string | null }, contactId: string) {
  if (clinic.kind === "partner" || !clinicModules(clinic).has("diagnosis")) return false;
  const { rows } = await db.execute(sql`select 1 from patient_record pr where pr.contact_id = ${contactId} and (
    exists (select 1 from report r where r.patient_id = pr.id)
    or exists (select 1 from predict_referral pf where pf.patient_id = pr.id and pf.status <> 'cancelled')
    or exists (select 1 from blood_test_order bo where bo.patient_id = pr.id and bo.status <> 'cancelled')) limit 1`);
  return rows.length > 0;
}

/**
 * One contact by id, with the consent row the 360 view's header needs.
 *
 * The detail page used to fetch /api/contacts (capped at 500 rows) and
 * Array.find() the one it wanted — which quietly returns "not found" for
 * contact 501 onwards, exactly when the CRM stops being small.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;

  const { id } = await params;

  const [row] = await db.select().from(contact).where(eq(contact.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Someone else's clinic is "not found", not "forbidden": whether a record
  // exists elsewhere is itself none of this clinic's business.
  // Exception: Predict (a clinic with Diagnosis on) does every clinic's blood
  // tests, so it may open anyone who has one — read-only on their course.
  if (row.clinicId && row.clinicId !== context.clinic.id && !(await diagnosisMayOpen(context.clinic, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scope = await leadScope(context.principal);
  if (sideForStage(row.stage) === "leads" && !(await canSeeLead(scope, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [preferences] = await db
    .select()
    .from(contactCommunicationPreference)
    .where(eq(contactCommunicationPreference.contactId, id))
    .limit(1);

  // Every lead form they filled in — the answers are what the first call
  // opens with, so they come with the contact rather than behind a tab.
  const leadForms = await db
    .select()
    .from(leadSubmission)
    .where(eq(leadSubmission.contactId, id))
    .orderBy(desc(leadSubmission.receivedAt))
    .limit(20);

  // No preference row means opted in everywhere — see checkConsent() in
  // @workspace/communication. Say so explicitly rather than returning null
  // and letting the UI guess.
  const [assignee] = row.assignedUserId
    ? await db.select({ name: user.name }).from(user).where(eq(user.id, row.assignedUserId)).limit(1)
    : [];

  return NextResponse.json({
    contact: { ...row, assignedUserName: assignee?.name ?? null },
    preferences: preferences ?? null,
    leadForms,
    canReassign: scope.all,
    // What the active clinic does: the 360 view hides Therapy where it is off.
    modules: [...clinicModules(context.clinic)],
    // Another clinic's patient Predict opened for its blood-test work: the
    // page shows Overview and Medical only, and no lead or status controls.
    crossClinic: Boolean(row.clinicId && row.clinicId !== context.clinic.id),
  });
}

/**
 * The stages a person may be moved to by hand, and only these.
 *
 * BOOKED and PATIENT are deliberately absent. Both are *earned* by an event —
 * an appointment row existing, and that appointment being marked completed —
 * and the console's funnel derives "Booked" and "Attended" from exactly those
 * rows. Letting someone type BOOKED in would produce a contact sitting in the
 * Booked column with nothing booked, which is the specific kind of lie the
 * derived funnel exists to prevent.
 *
 * What is left is the set that genuinely needs human judgement: they said no
 * (LOST), they have gone quiet (INACTIVE), or they are back in play (LEAD).
 */
const MANUAL_STAGES = ["LEAD", "INACTIVE", "LOST"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const [existing] = await db.select().from(contact).where(eq(contact.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.clinicId && existing.clinicId !== context.clinic.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextStage = typeof body?.stage === "string" ? body.stage : null;
  const nextEngagement =
    body?.engagement === null ? null : typeof body?.engagement === "string" ? body.engagement : undefined;

  if (nextStage !== null && !MANUAL_STAGES.includes(nextStage)) {
    return NextResponse.json(
      {
        error:
          `"${nextStage}" cannot be set by hand. BOOKED follows from creating an appointment, ` +
          `and PATIENT from marking one completed.`,
      },
      { status: 400 },
    );
  }

  if (
    nextEngagement !== undefined &&
    nextEngagement !== null &&
    !Object.values(ContactEngagement).includes(nextEngagement as ContactEngagement)
  ) {
    return NextResponse.json({ error: `"${nextEngagement}" is not a valid engagement` }, { status: 400 });
  }

  // Audience -> Lead by hand is an enquiry like any other: routed to an owner
  // and started on the new-lead flow, not just relabelled.
  if (nextStage === "LEAD" && existing.stage === "AUDIENCE") {
    await promoteToLead(db, id, { reason: "marked as lead by staff", payload: { byUserId: session.user.id } });
    if (nextEngagement === undefined) {
      const [row] = await db.select().from(contact).where(eq(contact.id, id)).limit(1);
      return NextResponse.json({ contact: row });
    }
  }

  const updates: { stage?: string; engagement?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (nextStage !== null && !(nextStage === "LEAD" && existing.stage === "AUDIENCE")) updates.stage = nextStage;
  if (nextEngagement !== undefined) updates.engagement = nextEngagement;

  if (updates.stage === undefined && updates.engagement === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [row] = await db.update(contact).set(updates).where(eq(contact.id, id)).returning();

  if (updates.stage !== undefined && updates.stage !== existing.stage) {
    await emitDomainEvent(
      db,
      DomainEventType.CONTACT_STAGE_CHANGED,
      { contactId: id, stage: updates.stage, previousStage: existing.stage, byUserId: session.user.id },
      { contactId: id },
    );
  }

  if (updates.engagement !== undefined && updates.engagement !== existing.engagement) {
    await emitDomainEvent(
      db,
      DomainEventType.CONTACT_ENGAGEMENT_CHANGED,
      {
        contactId: id,
        engagement: updates.engagement,
        previousEngagement: existing.engagement,
        byUserId: session.user.id,
      },
      { contactId: id },
    );
  }

  // DO_NOT_CONTACT used to be decorative. checkConsent() — the only thing
  // that actually stops a send — reads contactCommunicationPreference and has
  // never looked at engagement, so marking someone "do not contact" changed a
  // label and nothing else, while the messages kept going out. Writing the
  // consent row here is what makes the label mean what it says.
  //
  // transactional stays on: those are replies to something the person
  // themselves asked for (a booking they made), not outreach.
  if (updates.engagement === ContactEngagement.DO_NOT_CONTACT) {
    const optOut = {
      marketing: false,
      appointmentReminders: false,
      medicalReminders: false,
      whatsappEnabled: false,
      emailEnabled: false,
      smsEnabled: false,
      pushEnabled: false,
      updatedAt: new Date(),
    };

    await db
      .insert(contactCommunicationPreference)
      .values({ contactId: id, ...optOut })
      .onConflictDoUpdate({ target: contactCommunicationPreference.contactId, set: optOut });
  }

  return NextResponse.json({ contact: row });
}

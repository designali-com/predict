import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { appointment, bloodTestOrder, contact, patientRecord } from "@workspace/db/schema";
import { eq, or, sql } from "@workspace/db";
import { isPartnerClinic, isSuperadmin } from "@workspace/db/clinic-service";
import { can, isUnrestricted } from "@workspace/db/permission-service";
import { clinicModules } from "@workspace/db/clinic-modules";
import { clinicContext } from "./clinic";

/**
 * The wall around each clinic's patients.
 *
 * Every clinic sees only the patients on its own books. A doctor at a partner
 * hospital (Apollo) works in the clinic panel like anyone else, but may only
 * ever see the patients their hospital registered — never Predict's own, never
 * another partner's. The same now holds between Predict's own clinics: OPTM's
 * desk does not open another clinic's chart by pasting its id. The patient
 * list is already filtered by clinic; this is the check for everything that
 * opens one patient by id, which until now trusted whoever held the page
 * permission.
 *
 * A contact with no clinic yet (an old row, an app sign-up nobody placed) is
 * open to our own clinics, never to a partner. Two people stand outside the
 * wall: a superadmin, who sees all, and the lab — it is Predict's, and works
 * on every clinic's samples — but only while acting in one of our clinics.
 */

/** The partner clinic the caller is acting inside, or null if they are not narrowed. */
export async function partnerClinicId(): Promise<string | null> {
  const context = await clinicContext();
  if (!context) return null;
  if (isUnrestricted(context.session.user.role)) return null;
  return isPartnerClinic(context.clinic) ? context.clinic.id : null;
}

/**
 * The clinic whose patients the caller may open: `"all"` for a superadmin or
 * the lab, null when they act in no clinic at all (they open nobody's chart).
 */
async function patientScope(): Promise<{ clinicId: string; partner: boolean; diagnosis: boolean } | "all" | null> {
  const context = await clinicContext();
  if (!context) return null;
  if (isSuperadmin(context.session.user.role)) return "all";
  const partner = isPartnerClinic(context.clinic);
  if (!partner && (await can(db, context.principal, "clinic.lab"))) return "all";
  // Predict (a clinic with Diagnosis switched on) does the blood tests for
  // every clinic, so it may open anyone who has one — see canSeePatient.
  const diagnosis = !partner && clinicModules(context.clinic).has("diagnosis");
  return { clinicId: context.clinic.id, partner, diagnosis };
}

/** Any id a patient route accepts — chart, contact or login — to the contact's clinic. */
async function clinicOfPatient(id: string): Promise<{ found: boolean; clinicId: string | null }> {
  const [chart] = await db
    .select({ contactId: patientRecord.contactId })
    .from(patientRecord)
    .where(or(eq(patientRecord.id, id), eq(patientRecord.userId, id)))
    .limit(1);
  const contactId = chart?.contactId ?? id;
  const [person] = await db
    .select({ clinicId: contact.clinicId })
    .from(contact)
    .where(or(eq(contact.id, contactId), eq(contact.userId, id)))
    .limit(1);
  if (!person) return { found: Boolean(chart), clinicId: null };
  return { found: true, clinicId: person.clinicId };
}

/**
 * Whether the caller may open this patient.
 *
 * No id means the caller's own record (a patient filing their own report) —
 * fine anywhere but a partner hospital, as before. A patient on no clinic's
 * books, or an id that names nobody, is our clinics' to see; the route itself
 * answers 404 for the latter.
 */
export async function canSeePatient(
  id: string | null | undefined,
  opts: { diagnosis?: boolean } = {},
): Promise<boolean> {
  const scope = await patientScope();
  if (scope === "all") return true;
  if (!id) return !scope?.partner;
  if (!scope) return false;
  const owner = await clinicOfPatient(id);
  if (scope.partner) return owner.found && owner.clinicId === scope.clinicId;
  if (owner.clinicId === null || owner.clinicId === scope.clinicId) return true;
  // Predict reaches another clinic's patient for its own work only — blood
  // tests, biomarkers, reports, the app login — never their treatment, diet,
  // rehab, notes or money. Those routes pass { diagnosis: true }.
  return Boolean(opts.diagnosis) && scope.diagnosis && (await hasBloodTest(id));
}

/** Whether this patient (chart, contact or login id) is Predict's to work on. */
async function hasBloodTest(id: string): Promise<boolean> {
  const [chart] = await db
    .select({ id: patientRecord.id })
    .from(patientRecord)
    .where(or(eq(patientRecord.id, id), eq(patientRecord.contactId, id), eq(patientRecord.userId, id)))
    .limit(1);
  if (!chart) return false;
  // A blood report, a live referral to Predict, or a blood test ordered: any
  // of them makes the patient Predict's to work on, test done or not yet.
  const { rows } = await db.execute(sql`select 1 where exists (select 1 from report r where r.patient_id = ${chart.id})
    or exists (select 1 from predict_referral pf where pf.patient_id = ${chart.id} and pf.status <> 'cancelled')
    or exists (select 1 from blood_test_order bo where bo.patient_id = ${chart.id} and bo.status <> 'cancelled')`);
  return rows.length > 0;
}

/** For a route: a 404 response if the caller may not open this patient, else null. */
export async function guardPatient(id: string | null | undefined): Promise<NextResponse | null> {
  return (await canSeePatient(id)) ? null : NextResponse.json({ error: "No such patient." }, { status: 404 });
}

/**
 * guardPatient for Predict's own routes (blood tests, biomarkers, reports,
 * biological-age index, VALD, the app login): also lets Predict through to
 * another clinic's patient it has tested, been referred or ordered a test for.
 */
export async function guardDiagnosis(id: string | null | undefined): Promise<NextResponse | null> {
  return (await canSeePatient(id, { diagnosis: true })) ? null : NextResponse.json({ error: "No such patient." }, { status: 404 });
}

/** The patient a blood-test order belongs to. */
export async function guardBloodTestOrder(orderId: string): Promise<NextResponse | null> {
  if ((await patientScope()) === "all") return null;
  const [order] = await db
    .select({ patientId: bloodTestOrder.patientId, contactId: bloodTestOrder.contactId })
    .from(bloodTestOrder)
    .where(eq(bloodTestOrder.id, orderId))
    .limit(1);
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return guardPatient(order.patientId ?? order.contactId ?? null);
}

/** The patient an appointment belongs to — and, once stamped, the clinic it was booked in. */
export async function guardAppointment(appointmentId: string | null | undefined): Promise<NextResponse | null> {
  const scope = await patientScope();
  if (scope === "all") return null;
  // No visit named: nothing to open, except that a partner never gets the unbound form.
  if (!appointmentId) return scope?.partner ? NextResponse.json({ error: "Not found" }, { status: 404 }) : null;
  const [visit] = await db
    .select({ contactId: appointment.contactId, clinicId: appointment.clinicId })
    .from(appointment)
    .where(eq(appointment.id, appointmentId))
    .limit(1);
  if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (scope && visit.clinicId && visit.clinicId !== scope.clinicId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return guardPatient(visit.contactId);
}

/** For a route a partner hospital has no business in (therapy, stock, VALD…): 403 for them, null for everyone else. */
export async function denyPartner(): Promise<NextResponse | null> {
  return (await partnerClinicId())
    ? NextResponse.json({ error: "Not available to partner hospitals." }, { status: 403 })
    : null;
}

import { withReadableUrls } from "@workspace/storage";
import { clinicModules } from "@workspace/db/clinic-modules";
import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import {
  appointment,
  biomarkerReading,
  contact,
  patientRecord,
  payment,
  report,
} from "@workspace/db/schema";
import { and, desc, eq, isNull, or, sql } from "@workspace/db";
import { appointmentInClinic } from "@workspace/db/appointment-scope";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";
import { clinicContext, requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { updatePersonDetails } from "@workspace/db/patient-details";
import { guardPatient, guardDiagnosis, partnerClinicId } from "@/src/lib/auth/patient-scope";

/**
 * One patient's record, found by whichever id the caller happens to hold.
 *
 * A contact id from the roster, a patient id off a chart, or a user id from an
 * older link — all three name the same person, and which one a screen has
 * depends on how it got there. Refusing two of the three is how the clinic
 * panel ended up unable to open its own walk-in patients.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Read-only for Predict on another clinic's patient; PATCH stays own-clinic.
  const blocked = await guardDiagnosis((await params).id);
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(["clinic.patients", "clinic.appointments"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await clinicContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clinicId = context.clinic.id;

  const { id } = await params;

  const [chart] = await db
    .select()
    .from(patientRecord)
    .where(or(eq(patientRecord.id, id), eq(patientRecord.contactId, id), eq(patientRecord.userId, id)))
    .limit(1);

  // A contact with no chart yet is still a person worth opening — they have
  // been booked, or messaged, and the chart arrives on the first appointment.
  const contactId = chart?.contactId ?? id;
  const [person] = await db.select().from(contact).where(eq(contact.id, contactId)).limit(1);

  if (!chart && !person) {
    return NextResponse.json({ error: "No such patient" }, { status: 404 });
  }

  const visits = person
    ? await db
        .select()
        .from(appointment)
        // The visits made at this clinic. The same person seen at another
        // branch is that branch's record, not this one's.
        .where(and(eq(appointment.contactId, person.id), appointmentInClinic(clinicId)))
        .orderBy(desc(appointment.scheduledAt))
        .limit(20)
    : [];

  /**
   * Money and reports, for the tabs that show them.
   *
   * Fetched here rather than by each tab so opening the page is one request.
   * These are small per-patient lists — a course of payments, a handful of
   * uploads — not something worth four round trips and four spinners.
   */
  const payments = person
    ? await db
        .select()
        .from(payment)
        // Money taken here, plus unstamped rows from before clinics existed.
        .where(
          and(
            eq(payment.contactId, person.id),
            or(eq(payment.clinicId, clinicId), isNull(payment.clinicId)),
          ),
        )
        .orderBy(desc(payment.collectedAt))
    : [];

  const userId = chart?.userId ?? person?.userId ?? null;

  // By chart OR account. A report filed at the counter before the patient ever
  // signed up carries only the chart; one they uploaded themselves carries the
  // account. Asking for either finds both, and a patient who signs up later
  // does not lose the reports taken before they did.
  const reportKeys = [
    ...(chart ? [eq(report.patientId, chart.id)] : []),
    ...(userId ? [eq(report.userId, userId)] : []),
  ];

  const reports = reportKeys.length
    ? await db
        .select()
        .from(report)
        .where(reportKeys.length === 1 ? reportKeys[0] : or(...reportKeys))
        .orderBy(desc(report.uploadedAt))
    : [];

  // How many blood markers have ever been recorded. A count, not the rows:
  // the chips only need to know whether a blood test has happened at all.
  const [markers] = userId
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(biomarkerReading)
        .where(eq(biomarkerReading.userId, userId))
    : [{ n: 0 }];

  // A partner hospital's doctor sees the chart and results, not Predict's
  // money or therapy — the record view hides those tabs on this flag.
  const partner = Boolean(await partnerClinicId());
  const mods = clinicModules(context.clinic);
  return NextResponse.json({
    // modules: what this clinic does — the record view hides tabs for the rest
    // (Predict, diagnosis only, has no visits, treatment or billing).
    // crossClinic: another clinic's patient Predict opened for its blood-test
    // work — the view shows Overview and Lab only.
    viewer: {
      partner,
      modules: [...mods],
      crossClinic: Boolean(person?.clinicId && person.clinicId !== clinicId),
    },
    patient: chart ?? null,
    contact: person ?? null,
    // Nothing of a module the clinic does not run: Predict gets no visits or money.
    visits: mods.has("appointments") ? visits : [],
    payments: partner || !mods.has("billing") ? [] : payments,
    reports: await withReadableUrls(reports),
    biomarkerCount: Number(markers?.n ?? 0),
    // The latest live referral to Predict, for the clinic's one-line status.
    predictReferral: chart
      ? (((await db.execute<{ status: string }>(sql`select status from predict_referral where patient_id = ${chart.id} and status <> 'cancelled' order by created_at desc limit 1`)).rows[0]?.status) ?? null)
      : null,
    // Reports, biomarkers and biological age are all keyed on the login, so a
    // chart with none has none to show — and saying so beats an empty panel
    // that looks like a patient with no results.
    hasLogin: Boolean(chart?.userId ?? person?.userId),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiPermission("clinic.patients");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    phone?: unknown;
    email?: unknown;
    dateOfBirth?: unknown;
    gender?: unknown;
    bloodGroup?: unknown;
  } | null;

  const [chart] = await db
    .select({ contactId: patientRecord.contactId })
    .from(patientRecord)
    .where(or(eq(patientRecord.id, id), eq(patientRecord.contactId, id), eq(patientRecord.userId, id)))
    .limit(1);

  const contactId = chart?.contactId ?? id;
  const [person] = await db.select({ id: contact.id }).from(contact).where(eq(contact.id, contactId)).limit(1);
  if (!person) return NextResponse.json({ error: "No such patient" }, { status: 404 });

  const result = await updatePersonDetails(db, {
    contactId: person.id,
    name: typeof body?.name === "string" ? body.name : "",
    phone: typeof body?.phone === "string" ? body.phone : "",
    email: typeof body?.email === "string" ? body.email : null,
    ...(typeof body?.dateOfBirth === "string" ? { dateOfBirth: body.dateOfBirth } : {}),
    ...(typeof body?.gender === "string" ? { gender: body.gender } : {}),
    ...(typeof body?.bloodGroup === "string" ? { bloodGroup: body.bloodGroup } : {}),
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

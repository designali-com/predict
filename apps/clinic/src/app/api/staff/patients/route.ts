import { NextResponse } from "next/server";
import { clinicModules } from "@workspace/db/clinic-modules";
import { db } from "@workspace/db/client";
import { contact, patientRecord, planEnrollment, appointment, report, clinic as clinicTable } from "@workspace/db/schema";
import { and, desc, eq, ilike, inArray, isNull, ne, or, sql } from "@workspace/db";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { isPartnerClinic } from "@workspace/db/clinic-service";

/**
 * The clinic's patient roster — everyone with a chart.
 *
 * This used to list `user` rows with role=patient, which meant it showed only
 * people who had signed up for the patient app. A walk-in registered at the
 * counter has a contact, a chart and a patient code, and often no login at all,
 * so most of the clinic's own patients were missing from the clinic's own
 * Patients page — while the operations console, which is contact-keyed, could
 * see them.
 *
 * Who is on the list — any one of these makes somebody the clinic's patient:
 *   - a treatment plan: prescribed, running or finished (not cancelled);
 *   - a blood report on their chart, plan or no plan;
 *   - added here, with Add patient — a chart with no appointment at all, since
 *     a booking always leaves one and Add patient never does.
 * A chart is made the first time an appointment is booked, but a consultation
 * alone is not enough; listing every chart filled the page with one-visit
 * enquiries. A search still finds any chart, so the desk can open a
 * consultation-only person to prescribe.
 */
export async function GET(req: Request) {
  const context = await requireClinicApiAnyPermission(["clinic.patients", "clinic.appointments"]);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim();
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? 1)) || 1);

  // A chart belongs to the clinic its person belongs to. Scoping here is
  // what stops one clinic's patient list showing the other's.
  // Blood tests and biomarkers are Predict's: a clinic that does diagnosis
  // also lists anyone with a blood report, whichever clinic treats them. Their
  // course stays with that clinic; the row says whose patient they are.
  const mods = clinicModules(context.clinic);
  const diagnosis = mods.has("diagnosis") && !isPartnerClinic(context.clinic);
  const treats = mods.has("therapy");
  // Predict's patient: a blood report, a live referral, or a blood test ordered.
  const hasBloodTest = sql`(exists (select 1 from report r where r.patient_id = "patient_record"."id")
    or exists (select 1 from predict_referral pf where pf.patient_id = "patient_record"."id" and pf.status <> 'cancelled')
    or exists (select 1 from blood_test_order bo where bo.patient_id = "patient_record"."id" and bo.status <> 'cancelled'))`;
  const ours = diagnosis ? or(eq(contact.clinicId, context.clinic.id), hasBloodTest)! : eq(contact.clinicId, context.clinic.id);
  const filters = [ours];
  // Bought medicine here (a bill that was not voided). Older bills carry no
  // clinic; they count for the clinic the person belongs to.
  const boughtMedicine = sql`exists (select 1 from medicine_sale ms
    where ms.contact_id = "patient_record"."contact_id" and ms.voided_at is null
      and (ms.clinic_id = ${context.clinic.id} or ms.clinic_id is null))`;
  const anyCourse = sql`exists (select 1 from plan_enrollment e where e.contact_id = "patient_record"."contact_id" and e.status <> 'cancelled')`;
  // Medicine only: set on the chart's track, or — without anybody setting it —
  // medicine billed and no course. A medicine bill is what makes them so.
  const medicineOnlySql = sql`("patient_record"."patient_track" = 'medicine_only' or (${boughtMedicine} and not ${anyCourse}))`;
  // Spelled out: inside a subquery drizzle may leave a column unqualified, and an
  // unqualified contact_id would mean the inner table's own — matching everybody.
  const isPatient = sql`(
    exists (select 1 from plan_enrollment e where e.contact_id = "patient_record"."contact_id" and e.status <> 'cancelled')
    or exists (select 1 from report r where r.patient_id = "patient_record"."id")
    or not exists (select 1 from appointment a where a.contact_id = "patient_record"."contact_id")
    or "patient_record"."patient_track" = 'medicine_only'
    or ${boughtMedicine}
  )`;
  if (!query) filters.push(isPatient);

  // The Type filter beside the search box. Same spelled-out columns as above.
  const plan = (cond: string) =>
    sql.raw(`exists (select 1 from plan_enrollment e where e.contact_id = "patient_record"."contact_id" and ${cond})`);
  const hasReport = sql`exists (select 1 from report r where r.patient_id = "patient_record"."id")`;
  const noPlan = sql`not ${plan("e.status <> 'cancelled'")}`;
  // Therapy bought one session at a time (see @workspace/db/walk-in) — not a course.
  const PER_SESSION = "exists (select 1 from treatment_plan tp where tp.id = e.treatment_plan_id and tp.is_per_session)";
  const TYPES: Record<string, ReturnType<typeof sql>> = {
    // A plan that does not say out station is an in-station one (older plans name neither).
    in_station: plan(`e.status <> 'cancelled' and e.plan_name not ilike '%out station%' and not ${PER_SESSION}`),
    per_session: plan(`e.status <> 'cancelled' and ${PER_SESSION}`),
    // Came for a course once, now only buys medicine — set on the chart's track.
    medicine_only: medicineOnlySql,
    out_station: plan("e.status <> 'cancelled' and e.plan_name ilike '%out station%'"),
    prescribed: plan("e.status = 'prescribed'"),
    active: plan("e.status = 'active'"),
    completed: plan("e.status = 'completed'"),
    // Predict has no courses of its own: any tested patient is "blood report",
    // course elsewhere or not. A treatment clinic shows a tested patient with
    // no course as registered (the blood test is Predict's).
    blood_report: treats ? sql`(${hasReport} and ${noPlan})` : hasReport,
    // Registered only: nothing else to say — no course, and (where there is
    // medicine) no medicine bought either.
    registered: diagnosis
      ? sql`(not ${hasReport} and ${noPlan})`
      : treats
        ? sql`(${noPlan} and not ${medicineOnlySql})`
        : noPlan,
  };
  // Several types at once (?type=in_station,per_session): a patient matching any of them.
  const picked = (url.searchParams.get("type") ?? "").split(",").filter((t) => TYPES[t]);
  if (picked.length === 1) filters.push(TYPES[picked[0]!]!);
  else if (picked.length > 1) filters.push(or(...picked.map((t) => TYPES[t]!))!);
  if (query) {
    const like = `%${query}%`;
    const match = or(
      ilike(patientRecord.firstName, like),
      ilike(patientRecord.lastName, like),
      ilike(patientRecord.mobileNumber, like),
      ilike(patientRecord.patientCode, like),
      ilike(contact.name, like),
    );
    if (match) filters.push(match);
  }

  const rows = await db
    .select({
      patientId: patientRecord.id,
      patientCode: patientRecord.patientCode,
      firstName: patientRecord.firstName,
      lastName: patientRecord.lastName,
      gender: patientRecord.gender,
      dateOfBirth: patientRecord.dateOfBirth,
      mobileNumber: patientRecord.mobileNumber,
      email: patientRecord.email,
      userId: patientRecord.userId,
      patientTrack: patientRecord.patientTrack,
      medicineOnly: sql<boolean>`${medicineOnlySql}`,
      // A live referral only. A blood test with no referral (done before
      // referrals were recorded) shows as tested, from hasReport.
      referredToPredict: sql<boolean>`exists (select 1 from predict_referral pf where pf.patient_id = "patient_record"."id" and pf.status <> 'cancelled')`,
      contactId: patientRecord.contactId,
      contactName: contact.name,
      clinicId: contact.clinicId,
      stage: contact.stage,
      createdAt: patientRecord.createdAt,
    })
    .from(patientRecord)
    .leftJoin(contact, eq(contact.id, patientRecord.contactId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(patientRecord.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  // How many match the search — what the pages are counted over.
  const [{ matched } = { matched: 0 }] = await db
    .select({ matched: sql<number>`count(*)::int` })
    .from(patientRecord)
    .leftJoin(contact, eq(contact.id, patientRecord.contactId))
    .where(filters.length ? and(...filters) : undefined);

  const contactIds = rows.map((r) => r.contactId).filter((v): v is string => Boolean(v));
  const chartIds = rows.map((r) => r.patientId);

  // Which of these charts carry a blood report — shown for those with no plan.
  const withReport = new Set(
    chartIds.length
      ? (await db.select({ id: report.patientId }).from(report).where(inArray(report.patientId, chartIds))).map((r) => r.id)
      : [],
  );

  // Whether they are on a course, and when they were last seen — the two things
  // that tell a clinician whether this row needs anything.
  const [courses, visits] = await Promise.all([
    contactIds.length
      ? db
          .select({
            contactId: planEnrollment.contactId,
            planName: planEnrollment.planName,
            status: planEnrollment.status,
            perSession: sql<boolean>`coalesce((select tp.is_per_session from treatment_plan tp where tp.id = "plan_enrollment"."treatment_plan_id"), false)`,
            sessions: sql<number>`(select count(*)::int from plan_sitting s where s.enrollment_id = "plan_enrollment"."id")`,
          })
          .from(planEnrollment)
          .where(
            and(inArray(planEnrollment.contactId, contactIds), ne(planEnrollment.status, "cancelled")),
          )
      : Promise.resolve([]),
    contactIds.length
      ? db
          .select({
            contactId: appointment.contactId,
            last: sql<string>`max(${appointment.scheduledAt})`,
            total: sql<number>`count(*)::int`,
          })
          .from(appointment)
          .where(inArray(appointment.contactId, contactIds))
          .groupBy(appointment.contactId)
      : Promise.resolve([]),
  ]);

  // This clinic's charts, not every clinic's.
  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(patientRecord)
    .innerJoin(contact, eq(contact.id, patientRecord.contactId))
    .where(and(ours, isPatient));

  // A partner hospital finds only its own people; our clinics also find
  // contacts no clinic has claimed yet, as before.
  const partner = isPartnerClinic(context.clinic);

  /**
   * People we know who have no chart yet.
   *
   * Only when searching, and only then because this page is where the desk
   * starts: typing a number and being told "nobody matches" is wrong when
   * the number is sitting in contacts. They are a lead, a walk-in nobody has
   * booked yet, or somebody whose chart was never created — and all three
   * need to be found and acted on, not hidden because a row is missing.
   */
  const unchartered = query
    ? await db
        .select({
          contactId: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          stage: contact.stage,
          createdAt: contact.createdAt,
        })
        .from(contact)
        .leftJoin(patientRecord, eq(patientRecord.contactId, contact.id))
        .where(
          and(
            isNull(patientRecord.id),
            partner
              ? eq(contact.clinicId, context.clinic.id)
              : or(eq(contact.clinicId, context.clinic.id), isNull(contact.clinicId)),
            or(
              ilike(contact.name, `%${query}%`),
              ilike(contact.phone, `%${query}%`),
              ilike(contact.email, `%${query}%`),
            ),
          ),
        )
        .orderBy(desc(contact.createdAt))
        .limit(20)
    : [];

  const clinicNames = new Map(
    (await db.select({ id: clinicTable.id, name: clinicTable.name, shortName: clinicTable.shortName }).from(clinicTable)).map(
      (c) => [c.id, c.shortName || c.name] as const,
    ),
  );

  return NextResponse.json({
    // What this clinic does: Predict (diagnosis only) hides station and course.
    modules: [...clinicModules(context.clinic)],
    total,
    matched,
    page,
    unchartered,
    patients: rows.map((r) => {
      // The course that says most about them now: running, then prescribed, then done.
      const rank: Record<string, number> = { active: 0, prescribed: 1, completed: 2 };
      const course =
        courses
          .filter((c) => c.contactId === r.contactId)
          .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))[0] ?? null;
      const visit = visits.find((v) => v.contactId === r.contactId) ?? null;
      const ownRow = !r.clinicId || r.clinicId === context.clinic.id;
      // The chart's name first. The contact's is whatever an ad form or a
      // WhatsApp profile said when the number first came in — often a
      // nickname, sometimes a different person on a shared family phone —
      // while the chart's is what the patient gave at registration. Showing
      // the contact's put a lead's name on somebody else's clinical record.
      const chartName = joinName(r.firstName, r.lastName);
      return {
        ...r,
        name: chartName || r.contactName || "Unknown",
        // Kept so the roster can say "also known as" when the two differ.
        // Only a genuinely different name — not the same one in other case or
        // spacing, nor the first name alone ("Rahul" for "Rahul Sharma").
        contactName: r.contactName && !sameName(r.contactName, chartName) ? r.contactName : null,
        // "On a course" is the useful state here, not contact.stage — the
        // roster is clinical and the stage is the funnel.
        // Another clinic's course, visits and track are that clinic's business.
        course: course && ownRow
          ? { planName: course.planName, status: course.status, perSession: Boolean(course.perSession), sessions: course.sessions ?? 0 }
          : null,
        // Medicine billed and no course, or set on the chart's track.
        medicineOnly: ownRow && Boolean(r.medicineOnly),
        // In station / out station, read off the plan's own name.
        // Single sessions are neither in nor out station: there is no course to be on.
        station: course && ownRow && !course.perSession ? (/out[\s-]*station/i.test(course.planName) ? "out" : "in") : null,
        hasReport: withReport.has(r.patientId),
        lastVisitAt: ownRow ? (visit?.last ?? null) : null,
        visitCount: ownRow ? (visit?.total ?? 0) : 0,
        // A chart with no login cannot see anything in the patient app. That is
        // worth showing: it is the difference between a patient who can log
        // their own home therapy and one who cannot.
        hasLogin: Boolean(r.userId),
        referredToPredict: Boolean(r.referredToPredict),
        // Listed here for their blood test, but treated by another clinic.
        otherClinic: r.clinicId && r.clinicId !== context.clinic.id ? (clinicNames.get(r.clinicId) ?? "Another clinic") : null,
      };
    }),
  });
}

/** A chart's name, each word once ("Mrigendra Mrigendra" → "Mrigendra"). */
function joinName(...parts: (string | null | undefined)[]): string {
  const words = parts.flatMap((p) => (p ?? "").trim().split(/\s+/)).filter(Boolean);
  return words.filter((w, i) => i === 0 || w.toLowerCase() !== words[i - 1]!.toLowerCase()).join(" ");
}

/** The same person's name, written another way: every word of one is in the other. */
function sameName(a: string, b: string): boolean {
  const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w) => long.includes(w));
}

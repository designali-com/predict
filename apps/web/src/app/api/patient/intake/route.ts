import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { contact, patientRecord } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { PLAN_TURNAROUND_HOURS, type IntakeFlags } from "@workspace/db/patient-intake";
import { patientDashboard } from "@workspace/db/patient-dashboard";
import { IntakeValidationError, getIntake, saveIntake } from "@workspace/db/patient-intake-store";
import { getPatientPlan, refreshPatientPlan } from "@workspace/db/diet-plan-store";
import { STUB_DATE_OF_BIRTH } from "@workspace/db/registration-sync";
import { auth } from "@/src/lib/auth/auth";

/**
 * The signed-in patient's plan questionnaire — read it, save progress, submit.
 *
 * Always the patient's own: the contact is found from the session, never
 * from the request, so nobody can read or write somebody else's answers by
 * changing an id.
 */

async function patientContext() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const chart = await db.query.patientRecord.findFirst({
    where: eq(patientRecord.userId, session.user.id),
  });
  const contactId =
    chart?.contactId ??
    (await db.query.contact.findFirst({ columns: { id: true }, where: eq(contact.userId, session.user.id) }))?.id ??
    null;

  return { session, chart, contactId };
}

function yearsSince(dateOfBirth: string): number | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age -= 1;
  return age > 0 && age < 120 ? age : null;
}

export async function GET() {
  const context = await patientContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!context.contactId) {
    return NextResponse.json({ error: "No patient record is linked to this account yet." }, { status: 404 });
  }

  // What the clinic already knows, offered as a starting point. Only for a
  // first go — once they have answered, their own answer wins.
  const chart = context.chart;
  const age = chart?.dateOfBirth && chart.dateOfBirth !== STUB_DATE_OF_BIRTH ? yearsSince(chart.dateOfBirth) : null;
  const sex = chart?.gender === "FEMALE" ? "Female" : chart?.gender === "MALE" ? "Male" : null;

  // Which of their markers are out of range, from their own latest readings.
  // A questionnaire step can then say "your CRP came back high" — and only
  // ever when it did. Nothing else about the readings is sent.
  const report = await patientDashboard(db, { userId: context.session.user.id });
  const flags: IntakeFlags = {};
  for (const marker of report.biomarkers) {
    if (marker.status === "High" || marker.status === "Low") flags[marker.shortCode.toLowerCase()] = marker.status;
  }

  // The plan is only shown once the questionnaire is submitted: until then it
  // cannot know whether they are vegetarian, what they are allergic to or
  // what they already take, and a diet and supplement list that ignores
  // those is not one to hand anybody. Made now if they have submitted and
  // there is a report but no plan yet.
  const intake = await getIntake(db, context.contactId);
  let plan = intake?.status === "submitted" ? await getPatientPlan(db, context.contactId) : null;
  if (!plan && intake?.status === "submitted") {
    plan = await refreshPatientPlan(db, context.contactId).catch((error) => {
      console.error("[plan] build failed:", error);
      return null;
    });
  }

  return NextResponse.json({
    intake,
    plan,
    prefill: { ...(age ? { age_years: String(age) } : {}), ...(sex ? { sex } : {}) },
    flags,
    turnaroundHours: PLAN_TURNAROUND_HOURS,
  });
}

const bodySchema = z.object({
  // Bounded so a questionnaire cannot be used to park megabytes in a row that
  // is read every time the patient's record opens. Unknown keys are dropped
  // when saved (pruneIntakeAnswers), so only the questions asked are kept.
  answers: z.record(
    z.string().max(60),
    z.union([z.string().max(2000), z.array(z.string().max(200)).max(20)]),
  ),
  step: z.number().int().min(0).max(20),
  submit: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const context = await patientContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!context.contactId) {
    return NextResponse.json({ error: "No patient record is linked to this account yet." }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Those answers could not be read." }, { status: 400 });

  try {
    const intake = await saveIntake(db, {
      contactId: context.contactId,
      answers: parsed.data.answers,
      step: parsed.data.step,
      submit: parsed.data.submit === true,
      actorUserId: context.session.user.id,
    });
    // Once submitted, every change to the answers changes the plan.
    let plan = null;
    if (intake.status === "submitted") {
      plan = await refreshPatientPlan(db, context.contactId, {
        reason: "The patient changed their questionnaire answers.",
      }).catch((error) => {
        console.error("[plan] refresh after questionnaire failed:", error);
        return null;
      });
    }
    return NextResponse.json({ intake, plan, turnaroundHours: PLAN_TURNAROUND_HOURS });
  } catch (error) {
    if (error instanceof IntakeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[intake] save failed:", error);
    return NextResponse.json({ error: "Your answers could not be saved. Please try again." }, { status: 500 });
  }
}

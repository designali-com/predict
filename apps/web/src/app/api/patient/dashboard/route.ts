import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@workspace/db/client";
import { patientDashboard } from "@workspace/db/patient-dashboard";
import { auth } from "@/src/lib/auth/auth";

/**
 * Everything the dashboard draws, in one call.
 *
 * One endpoint rather than three, because the age bar, the clock and the
 * biomarker radar are all cuts of the same panel — fetched separately they
 * could land a render apart and show a patient two different bodies.
 *
 * Which index the clock is built from is the patient's own — chosen for them
 * on their record in the clinic panel, CBLAI until somebody does. It is read
 * from the chart inside patientDashboard, not from anything this request
 * says, so a patient cannot switch themselves onto a kinder-looking model.
 *
 * No `?userId=` here on purpose: in this app a session is always the patient
 * themselves, so the chart is resolved from the session and there is nothing
 * to override.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dashboard = await patientDashboard(db, { userId: session.user.id });

  return NextResponse.json({
    ...dashboard,
    patient: { ...dashboard.patient, name: dashboard.patient.name ?? session.user.name ?? null },
  });
}

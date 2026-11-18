import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { checkInSitting } from "@workspace/db/enrollment-service";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { guardSitting } from "@/src/lib/auth/enrollment-scope";
import { describeError } from "@/src/lib/api-error";
import { denyPartner } from "@/src/lib/auth/patient-scope";

/**
 * "They are here for their therapy day."
 *
 * The one action the front desk needs for a therapy visit, and it takes no
 * arguments beyond which day. Everything else — the patient, the course, the
 * day number, the date — was decided when the course was activated.
 *
 * Gated on the schedule as well as appointments: the person working the day's
 * therapy list is looking at /schedule, and making them hold the appointments
 * permission to say somebody walked in would be gating the wrong thing.
 */
const CAN_CHECK_IN = ["clinic.schedule", "clinic.appointments", "clinic.patients"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(CAN_CHECK_IN);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const elsewhere = await guardSitting(id, context.clinic);
  if (elsewhere) return elsewhere;

  try {
    const result = await checkInSitting(db, { sittingId: id, actorId: context.session.user.id });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not check that day in") },
      { status: 400 },
    );
  }
}

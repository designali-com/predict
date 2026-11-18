import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { logSitting } from "@workspace/db/enrollment-service";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { guardSitting } from "@/src/lib/auth/enrollment-scope";
import { describeError } from "@/src/lib/api-error";
import { denyPartner } from "@/src/lib/auth/patient-scope";

// clinic.schedule is here because the day therapy list lives on /schedule —
// the person working that list is exactly who ticks a day off, and making them
// hold a second permission to do it would gate the wrong thing.
const CAN_LOG = [
  "clinic.schedule",
  "clinic.patients",
  "clinic.appointments",
  "clinic.treatment_plans",
];

/**
 * One line of a patient's log sheet, filled in by staff.
 *
 * Source is fixed to "staff" here and cannot be sent by the caller — the whole
 * value of recording who said a therapy happened is lost if the client can
 * claim to be the patient, or the patient's own app can claim to be staff.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(CAN_LOG);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const elsewhere = await guardSitting(id, context.clinic);
  if (elsewhere) return elsewhere;
  const body = await req.json().catch(() => null);

  try {
    const sitting = await logSitting(db, {
      sittingId: id,
      status: body?.status,
      mode: body?.mode,
      note: body?.note,
      source: "staff",
      actorId: context.session.user.id,
    });
    return NextResponse.json({ sitting });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not update this sitting") },
      { status: 400 },
    );
  }
}

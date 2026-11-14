import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { logSittingVisit } from "@workspace/db/enrollment-service";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { guardBookingId, guardEnrollment } from "@/src/lib/auth/enrollment-scope";
import { describeError } from "@/src/lib/api-error";
import { denyPartner } from "@/src/lib/auth/patient-scope";

const CAN_LOG = ["clinic.schedule", "clinic.patients", "clinic.appointments", "clinic.treatment_plans"];

/**
 * The patient came: log today's sitting on their course, with their signature.
 *
 * POST { date?, mode?, signatureDataUrl, signedName?, note?, bookingId? }
 *
 * The only way a sitting is written now — nothing is dated ahead when a course
 * starts. See logSittingVisit.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(CAN_LOG);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const elsewhere = await guardEnrollment(id, context.clinic);
  if (elsewhere) return elsewhere;
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const bookedElsewhere = await guardBookingId(str(body.bookingId), context.clinic);
  if (bookedElsewhere) return bookedElsewhere;
  try {
    const sitting = await logSittingVisit(db, {
      enrollmentId: id,
      contactId: str(body.contactId) ?? undefined,
      date: str(body.date) ?? undefined,
      mode: str(body.mode) ?? undefined,
      signatureDataUrl: str(body.signatureDataUrl),
      signedName: str(body.signedName),
      note: str(body.note),
      bookingId: str(body.bookingId),
      actorId: context.session.user.id,
    });
    return NextResponse.json({ sitting }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not log the sitting") }, { status: 400 });
  }
}

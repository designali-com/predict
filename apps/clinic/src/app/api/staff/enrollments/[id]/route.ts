import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { planEnrollment } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { isEnrollmentStatus } from "@workspace/db/treatment-plan";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { guardEnrollment } from "@/src/lib/auth/enrollment-scope";
import { denyPartner } from "@/src/lib/auth/patient-scope";

const CAN_ENROL = ["clinic.patients", "clinic.appointments", "clinic.treatment_plans"];

/**
 * Stopping or reopening a course.
 *
 * Cancelling leaves every sitting where it is rather than deleting the
 * remaining days: the patient paid for forty-two, they had nine, and erasing
 * the thirty-three that did not happen would erase the only evidence of what
 * was owed.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(CAN_ENROL);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const elsewhere = await guardEnrollment(id, context.clinic);
  if (elsewhere) return elsewhere;
  const body = await req.json().catch(() => null);

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (body?.status !== undefined) {
    if (!isEnrollmentStatus(body.status)) {
      return NextResponse.json({ error: "Pick active, completed or cancelled." }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body?.notes !== undefined) {
    patch.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  }

  const [updated] = await db
    .update(planEnrollment)
    .set(patch)
    .where(eq(planEnrollment.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "That course no longer exists." }, { status: 404 });
  return NextResponse.json({ enrollment: updated });
}

import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { extendCourse, type DiscountInput } from "@workspace/db/enrollment-service";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { guardEnrollment } from "@/src/lib/auth/enrollment-scope";
import { describeError } from "@/src/lib/api-error";
import { formOwnersFor, mayPrescribe } from "@workspace/db/clinical-forms";
import { grantedPermissions, isUnrestricted } from "@workspace/db/permission-service";
import { denyPartner } from "@/src/lib/auth/patient-scope";

const CAN_READ = ["clinic.patients", "clinic.appointments", "clinic.treatment_plans"];

/**
 * Extend a running course with another plan.
 *
 * POST { treatmentPlanId, discount?: { mode, value, reason? } }
 *
 * The same people who prescribe a package extend one. See extendCourse.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(CAN_READ);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;

  const role = session.user.role ?? "";
  const held = new Set(await grantedPermissions(db, session.user));
  if (!mayPrescribe(formOwnersFor(role, held, isUnrestricted(role)))) {
    return NextResponse.json({ error: "Only the doctor or the front desk extends a package." }, { status: 403 });
  }
  const enrollmentId = (await params).id;
  const elsewhere = await guardEnrollment(enrollmentId, context.clinic);
  if (elsewhere) return elsewhere;

  const body = (await req.json().catch(() => null)) as { treatmentPlanId?: unknown; discount?: unknown } | null;
  const d = (body?.discount ?? null) as { mode?: unknown; value?: unknown; reason?: unknown } | null;
  const value = Number(d?.value);
  const discount: DiscountInput | null =
    d && Number.isFinite(value) && value > 0
      ? { mode: d.mode === "percent" ? "percent" : "amount", value, reason: typeof d.reason === "string" ? d.reason.slice(0, 200) : null }
      : null;

  try {
    const enrollment = await extendCourse(db, {
      enrollmentId,
      treatmentPlanId: String(body?.treatmentPlanId ?? ""),
      discount,
      actorId: session.user.id,
    });
    return NextResponse.json({ enrollment });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not extend the course") }, { status: 400 });
  }
}

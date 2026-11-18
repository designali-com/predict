import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { addFreeSittings } from "@workspace/db/enrollment-service";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { guardEnrollment } from "@/src/lib/auth/enrollment-scope";
import { describeError } from "@/src/lib/api-error";
import { formOwnersFor, mayPrescribe } from "@workspace/db/clinical-forms";
import { grantedPermissions, isUnrestricted } from "@workspace/db/permission-service";
import { denyPartner } from "@/src/lib/auth/patient-scope";

const CAN_READ = ["clinic.patients", "clinic.appointments", "clinic.treatment_plans"];

/**
 * Give free sittings on a course — no charge, no medicine. See addFreeSittings.
 *
 * POST { count, reason? }
 *
 * The same people who prescribe or extend a package give them.
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
    return NextResponse.json({ error: "Only the doctor or the front desk gives free sittings." }, { status: 403 });
  }
  const enrollmentId = (await params).id;
  const elsewhere = await guardEnrollment(enrollmentId, context.clinic);
  if (elsewhere) return elsewhere;

  const body = (await req.json().catch(() => null)) as { count?: unknown; reason?: unknown } | null;
  try {
    const enrollment = await addFreeSittings(db, {
      enrollmentId,
      count: Number(body?.count),
      reason: typeof body?.reason === "string" ? body.reason.slice(0, 200) : null,
      actorId: session.user.id,
    });
    return NextResponse.json({ enrollment });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not add free sittings") }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { planEnrollment } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { isIssuePurpose, issueFromPackage, packageBalance } from "@workspace/db/package-issue";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { guardEnrollment } from "@/src/lib/auth/enrollment-scope";
import { describeError } from "@/src/lib/api-error";
import { denyPartner, guardPatient } from "@/src/lib/auth/patient-scope";

const CAN_ISSUE = ["clinic.schedule", "clinic.patients", "clinic.appointments", "clinic.treatment_plans", "clinic.billing"];

async function courseOf(id: string) {
  const [course] = await db
    .select({ id: planEnrollment.id, contactId: planEnrollment.contactId })
    .from(planEnrollment)
    .where(eq(planEnrollment.id, id))
    .limit(1);
  return course;
}

/** What the package allots, has given and has left, per medicine. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicApiAnyPermission(CAN_ISSUE);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const course = await courseOf((await params).id);
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const blocked = (await guardPatient(course.contactId)) ?? (await guardEnrollment(course.id, context.clinic));
  if (blocked) return blocked;
  return NextResponse.json({ lines: await packageBalance(db, course.id) });
}

/**
 * Give medicine out of the package: POST { date?, lines: [{ medicineId, quantity, purpose: "clinic" | "home" }] }.
 * date is the day it was given (YYYY-MM-DD, default today) — earlier days can be written up.
 * More than the package has left is refused — the rest is sold on its own bill.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyPartner();
  if (denied) return denied;
  const context = await requireClinicApiAnyPermission(CAN_ISSUE);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const course = await courseOf((await params).id);
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const blocked = (await guardPatient(course.contactId)) ?? (await guardEnrollment(course.id, context.clinic));
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as { lines?: unknown; date?: unknown } | null;
  const lines = Array.isArray(body?.lines) ? body.lines : [];
  try {
    const written = await issueFromPackage(db, {
      enrollmentId: course.id,
      actorId: context.session.user.id,
      date: typeof body?.date === "string" ? body.date : null,
      lines: lines.map((l: { medicineId?: unknown; quantity?: unknown; purpose?: unknown }) => ({
        medicineId: String(l?.medicineId ?? ""),
        quantity: Number(l?.quantity ?? 0),
        purpose: isIssuePurpose(l?.purpose) ? l.purpose : ("" as never),
      })),
    });
    return NextResponse.json({ issued: written.length, lines: await packageBalance(db, course.id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not issue the medicine") }, { status: 400 });
  }
}

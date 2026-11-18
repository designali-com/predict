import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { createLibraryExerciseProtocol, listLibraryExerciseProtocols } from "@workspace/db/exercise-protocol-library";
import { requireClinicApiAnyPermission, requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";

/**
 * The exercise prescription library.
 *
 * GET  every prescription — for the library page, and for a patient's
 *      Exercise tab to pick one to assign
 * POST a new one — library editors only
 */
export async function GET() {
  const context = await requireClinicApiAnyPermission(["clinic.care_plan_library", "clinic.patients", "clinic.appointments"]);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ protocols: await listLibraryExerciseProtocols(db) });
}

export async function POST(req: Request) {
  const context = await requireClinicApiPermission("clinic.care_plan_library");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const created = await createLibraryExerciseProtocol(db, await req.json().catch(() => null), context.session.user.id);
    return NextResponse.json({ protocol: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not save the prescription") }, { status: 400 });
  }
}

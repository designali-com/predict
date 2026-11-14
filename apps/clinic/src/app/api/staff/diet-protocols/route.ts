import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { createLibraryProtocol, listLibraryProtocols } from "@workspace/db/diet-protocol-library";
import { requireClinicApiAnyPermission, requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";

/**
 * The diet protocol library.
 *
 * GET  every protocol — for the library page, and for a patient's Nutrition
 *      tab to pick one to assign (so patient staff may read it too)
 * POST a new one — library editors only
 */
export async function GET() {
  const context = await requireClinicApiAnyPermission(["clinic.care_plan_library", "clinic.patients"]);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ protocols: await listLibraryProtocols(db) });
}

export async function POST(req: Request) {
  const context = await requireClinicApiPermission("clinic.care_plan_library");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const created = await createLibraryProtocol(db, await req.json().catch(() => null), context.session.user.id);
    return NextResponse.json({ protocol: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not save the protocol") }, { status: 400 });
  }
}

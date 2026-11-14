import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import {
  getLibraryProtocol,
  removeLibraryProtocol,
  updateLibraryProtocol,
} from "@workspace/db/diet-protocol-library";
import { requireClinicApiAnyPermission, requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";

/** One library protocol: read it, correct it, or take it out of the library. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicApiAnyPermission(["clinic.care_plan_library", "clinic.patients"]);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const found = await getLibraryProtocol(db, (await params).id);
  if (!found) return NextResponse.json({ error: "No such protocol." }, { status: 404 });
  return NextResponse.json({ protocol: found });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicApiPermission("clinic.care_plan_library");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const updated = await updateLibraryProtocol(db, (await params).id, await req.json().catch(() => null), context.session.user.id);
    if (!updated) return NextResponse.json({ error: "No such protocol." }, { status: 404 });
    return NextResponse.json({ protocol: updated });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not save the protocol") }, { status: 400 });
  }
}

/** Hidden, not deleted: patients it was assigned to keep their own copy. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicApiPermission("clinic.care_plan_library");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ok = await removeLibraryProtocol(db, (await params).id, context.session.user.id);
  if (!ok) return NextResponse.json({ error: "No such protocol." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

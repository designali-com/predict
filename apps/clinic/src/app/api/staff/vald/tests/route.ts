import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { createValdTestType, listValdTestTypes, parseValdTestTypeInput } from "@workspace/db/vald-test-types";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";
import { denyPartner } from "@/src/lib/auth/patient-scope";

const CAN_USE = ["clinic.patients", "clinic.appointments", "clinic.biomarkers"];
// Doctors keep the catalogue (Care plan library), admins through settings.
const CAN_EDIT = ["clinic.care_plan_library", "clinic.settings"];

/**
 * The DynaMo test catalogue — ours, from vald_test_type.
 *
 * GET            the tests offered on the runner and the prescription form
 * GET ?all=1     every test, switched-off ones too (the settings page)
 * POST           a test the clinic adds itself
 */
export async function GET(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const all = new URL(req.url).searchParams.get("all") === "1";
  const session = await requireApiAnyPermission(all ? CAN_EDIT : [...CAN_USE, ...CAN_EDIT]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ tests: await listValdTestTypes(db, { includeInactive: all }) });
}

export async function POST(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(CAN_EDIT);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    const test = await createValdTestType(db, parseValdTestTypeInput(body));
    return NextResponse.json({ test }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not add the test." }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { clinicStaff } from "@workspace/db/clinic-service";
import { resolveRole } from "@workspace/db/roles";
import { denyPartner } from "@/src/lib/auth/patient-scope";

const STAFF_DIRECTORY_ROLES: readonly string[] = ["doctor", "health_coach", "nutritionist"];

// Read-only staff lookup — name + role only, never patient data. This is
// deliberately the opposite of the user directory: doctor/health_coach/
// nutritionist still can't see each other's patients, but they can see
// each other's names for booking/coordination (e.g. "who are the doctors
// to assign this appointment to").
export async function GET() {
  {
    // A partner hospital has no business with Predict's staff list.
    const blocked = await denyPartner();
    if (blocked) return blocked;
  }
  // Names and roles only, so this is gated on working anywhere clinical
  // rather than on managing appointments specifically — the booking form, the
  // directory and the patient chart all need the same picker.
  const context = await requireClinicApiAnyPermission([
    "clinic.appointments",
    "clinic.patients",
    "clinic.schedule",
  ]);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // This clinic's people only, by the role they hold HERE. The platform-wide
  // user list put every clinic's doctors in this clinic's booking picker.
  const members = await clinicStaff(db, context.clinic.id);

  const staff = members
    .filter((m) => m.isActive)
    .map((m) => ({ id: m.userId, name: m.name, role: resolveRole(m.role) }))
    .filter((m) => STAFF_DIRECTORY_ROLES.includes(m.role))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ staff });
}

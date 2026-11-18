import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { staffRoles } from "@workspace/db/role-service";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";

/**
 * The roles a staff member can be given — name, key and where they work.
 *
 * Separate from /api/superadmin/roles because the Team page only needs to
 * label and filter people, which an admin may do without being allowed to edit
 * the catalogue itself.
 */
export async function GET() {
  const session = await requireApiAnyPermission(["clinic.team", "clinic.patients"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = await staffRoles(db);
  return NextResponse.json({
    roles: roles.map((r) => ({ key: r.key, label: r.label, panel: r.panel })),
  });
}

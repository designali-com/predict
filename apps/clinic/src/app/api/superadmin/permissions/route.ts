import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { resolveRole } from "@workspace/db/roles";
import { grantToRole, revokeFromRole, isUnrestricted } from "@workspace/db/permission-service";
import { getRole, grantablePermissions } from "@workspace/db/role-service";
import { requireApiPermission } from "@/src/lib/auth/permissions";

/**
 * Turn one page on or off for a whole role — the default every new hire in it
 * starts with.
 *
 * Reading is done by /api/superadmin/roles, which returns the catalogue and
 * the grants together; this route only writes.
 */
export async function PATCH(req: Request) {
  const session = await requireApiPermission("clinic.roles");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const roleKey = typeof body?.role === "string" ? resolveRole(body.role) : "";
  const permission = typeof body?.permission === "string" ? body.permission : "";
  const granted = body?.granted === true;

  if (!roleKey) return NextResponse.json({ error: "role is required" }, { status: 400 });

  // Superadmin bypasses the table, so writing rows for it would be storing
  // something nothing reads. Making it editable would be worse: revoking the
  // Roles page from the only role that can reach it locks the door with the
  // key inside.
  if (isUnrestricted(roleKey)) {
    return NextResponse.json(
      { error: "Superadmin always holds every page and cannot be edited." },
      { status: 400 },
    );
  }

  const role = await getRole(db, roleKey);
  if (!role) return NextResponse.json({ error: "That role no longer exists." }, { status: 404 });

  // A grant outside the role's own panels would be a row nothing renders —
  // the editor never offers it, so a request for one is a stale page or a
  // hand-made call.
  if (granted && !(await grantablePermissions(db, role.key)).includes(permission)) {
    return NextResponse.json(
      { error: `${role.label} does not work in the panel that page belongs to.` },
      { status: 400 },
    );
  }

  try {
    if (granted) await grantToRole(db, role.key, permission, session.user.id);
    else await revokeFromRole(db, role.key, permission);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update" },
      { status: 400 },
    );
  }

  return NextResponse.json({ role: role.key, permission, granted });
}

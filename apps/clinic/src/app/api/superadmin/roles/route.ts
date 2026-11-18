import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { PERMISSIONS } from "@workspace/db/permissions";
import { allGrants, isUnrestricted } from "@workspace/db/permission-service";
import { RoleScope, createRole, rolesWithUsage } from "@workspace/db/role-service";
import { requireApiPermission } from "@/src/lib/auth/permissions";

/**
 * The role catalogue: every role, what it holds, and who is assigned it.
 *
 * PERMISSIONS ships alongside it because the two are read together — the
 * editor draws a table of pages per role, and asking for the page list in a
 * second request would only mean rendering an empty table first.
 */
export async function GET() {
  const session = await requireApiPermission("clinic.roles");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = await rolesWithUsage(db);

  return NextResponse.json({
    roles,
    permissions: PERMISSIONS,
    // Superadmin bypasses the table entirely, so it has no grants to send and
    // nothing to render as toggles.
    grants: await allGrants(
      db,
      roles.filter((r) => !isUnrestricted(r.key)).map((r) => r.key),
    ),
  });
}

export async function POST(req: Request) {
  const session = await requireApiPermission("clinic.roles");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label : "";
  const panel = typeof body?.panel === "string" ? body.panel : "";
  const description = typeof body?.description === "string" ? body.description : null;
  const copyFrom = typeof body?.copyFrom === "string" && body.copyFrom ? body.copyFrom : null;

  const scopes: string[] = [RoleScope.CLINIC, RoleScope.OPERATIONS, RoleScope.BOTH];
  if (!scopes.includes(panel)) {
    return NextResponse.json(
      { error: "Choose whether this role works in the clinic panel, operations, or both." },
      { status: 400 },
    );
  }

  try {
    const role = await createRole(db, {
      label,
      description,
      panel: panel as RoleScope,
      copyFrom,
      actorId: session.user.id,
    });
    return NextResponse.json({ role }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create the role" },
      { status: 400 },
    );
  }
}

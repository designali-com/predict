import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { RoleScope, deleteRole, updateRole } from "@workspace/db/role-service";
import { invalidatePermissionCache } from "@workspace/db/permission-service";
import { requireApiPermission } from "@/src/lib/auth/permissions";

/** Rename a role, reword it, or move which panel it works in. */
export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await requireApiPermission("clinic.roles");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await params;
  const body = await req.json().catch(() => null);

  const patch: { label?: string; description?: string | null; panel?: RoleScope } = {};
  if (typeof body?.label === "string") patch.label = body.label;
  if ("description" in (body ?? {})) patch.description = body.description ?? null;
  if (typeof body?.panel === "string") {
    const scopes: string[] = [RoleScope.CLINIC, RoleScope.OPERATIONS, RoleScope.BOTH];
    if (!scopes.includes(body.panel)) {
      return NextResponse.json({ error: "That is not a panel." }, { status: 400 });
    }
    patch.panel = body.panel as RoleScope;
  }

  try {
    const role = await updateRole(db, key, patch);
    // Moving a role between panels drops the pages the new one cannot show,
    // so cached grants would otherwise still open them for a few seconds.
    invalidatePermissionCache();
    return NextResponse.json({ role });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update the role" },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await requireApiPermission("clinic.roles");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await params;

  try {
    await deleteRole(db, key);
    invalidatePermissionCache();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete the role" },
      { status: 400 },
    );
  }
}

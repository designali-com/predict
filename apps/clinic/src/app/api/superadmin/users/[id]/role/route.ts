import { NextResponse } from "next/server";
import { eq, and, ne, sql } from "@workspace/db";
import { db } from "@workspace/db/client";
import { user as userTable, userPermission } from "@workspace/db/schema";
import { getRole } from "@workspace/db/role-service";
import { invalidatePermissionCache, isUnrestricted } from "@workspace/db/permission-service";
import { requireApiPermission } from "@/src/lib/auth/permissions";

/**
 * Move someone to a different role.
 *
 * Written straight to user.role rather than through better-auth's setRole,
 * which validates against a static map built at module load and so can never
 * know about a role created from the Roles page.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiPermission("clinic.team");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const roleKey = typeof body?.role === "string" ? body.role.trim() : "";

  if (!roleKey) return NextResponse.json({ error: "role is required" }, { status: 400 });

  // Changing your own role is how someone locks themselves out with no way
  // back in — there is no second superadmin to undo it in a one-person clinic.
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "You cannot change your own role. Ask another superadmin." },
      { status: 400 },
    );
  }

  const target = await db.select().from(userTable).where(eq(userTable.id, id)).limit(1);
  if (!target.length) return NextResponse.json({ error: "No such user" }, { status: 404 });

  const current = target[0]!;
  const role = await getRole(db, roleKey);
  if (!role) {
    return NextResponse.json(
      { error: `"${roleKey}" is not a role. Create it on the Roles page first.` },
      { status: 400 },
    );
  }

  if (role.key === current.role) return NextResponse.json({ role: role.key });

  // Losing the last superadmin means losing the only account that can create
  // another one.
  if (isUnrestricted(current.role) && !isUnrestricted(role.key)) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userTable)
      .where(and(eq(userTable.role, current.role!), ne(userTable.id, id)));

    if ((row?.count ?? 0) === 0) {
      return NextResponse.json(
        { error: "This is the only superadmin. Promote someone else first." },
        { status: 400 },
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(userTable)
      .set({ role: role.key, updatedAt: new Date() })
      .where(eq(userTable.id, id));

    // Per-user overrides are departures from a role's defaults, so they mean
    // nothing once the role underneath changes — a doctor's extra page kept
    // through a move to receptionist would grant a page the new role cannot
    // even show. They start again from the new role's defaults.
    await tx.delete(userPermission).where(eq(userPermission.userId, id));
  });

  invalidatePermissionCache(id);
  return NextResponse.json({ role: role.key, overridesCleared: true });
}

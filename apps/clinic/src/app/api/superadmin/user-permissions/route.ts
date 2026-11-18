import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { user } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { PERMISSIONS } from "@workspace/db/permissions";
import { panelsForRoleKey } from "@workspace/db/role-service";
import {
  isUnrestricted,
  setUserOverride,
  userPermissionMatrix,
} from "@workspace/db/permission-service";
import { requireApiPermission } from "@/src/lib/auth/permissions";

/**
 * One person's pages.
 *
 * Only the panels their role actually works in are returned. A doctor's list
 * containing lead-nurture flows is noise — they cannot reach that panel, and
 * the rows that do matter get harder to find.
 *
 * The role is a starting point, not a rule: two doctors at the same clinic do
 * not necessarily do the same job. Only the differences are stored, so a page
 * left alone keeps following the role as the role changes rather than freezing
 * at whatever it happened to be today.
 */
export async function GET(req: Request) {
  const session = await requireApiPermission("clinic.team");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const [target] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A superadmin holds everything by bypassing both tables, so a grid of
  // toggles for them would be controls that do nothing.
  const panels = await panelsForRoleKey(db, target.role);
  const visible = PERMISSIONS.filter((p) => panels.includes(p.panel));

  if (isUnrestricted(target.role)) {
    return NextResponse.json({
      user: target,
      unrestricted: true,
      permissions: visible,
      states: [],
    });
  }

  const states = await userPermissionMatrix(db, target);
  return NextResponse.json({
    user: target,
    unrestricted: false,
    permissions: visible,
    // Trimmed to match: sending states for pages the editor never shows would
    // let a stale grant sit there invisibly.
    states: states.filter((s) => visible.some((v) => v.key === s.permission)),
  });
}

export async function PATCH(req: Request) {
  const session = await requireApiPermission("clinic.team");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const permission = typeof body?.permission === "string" ? body.permission : "";
  // null clears the override back to inheriting the role. That is not the same
  // as revoking: a cleared permission follows the role from then on, which is
  // what someone means when they undo a change rather than deny access.
  const override = body?.override === null ? null : body?.override === true ? true : false;

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const [target] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (isUnrestricted(target.role)) {
    return NextResponse.json(
      { error: "Superadmin always holds every permission and cannot be edited." },
      { status: 400 },
    );
  }

  try {
    await setUserOverride(db, userId, permission, override, session.user.id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update" },
      { status: 400 },
    );
  }

  const panels = await panelsForRoleKey(db, target.role);
  const visible = new Set(PERMISSIONS.filter((p) => panels.includes(p.panel)).map((p) => p.key));
  const states = await userPermissionMatrix(db, target);
  return NextResponse.json({ states: states.filter((s) => visible.has(s.permission)) });
}

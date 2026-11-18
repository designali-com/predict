import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, inArray } from "drizzle-orm";
import { rolePermission, userPermission } from "./schema";
import type * as schema from "./schema";
import { Role, resolveRole } from "./roles";
import { PERMISSION_KEYS, isKnownPermission } from "./permissions";

type Database = NodePgDatabase<typeof schema>;

/**
 * Who is asking. Both fields matter: the role supplies the baseline and the id
 * supplies their departures from it, so a check with only one of them answers
 * a different question than the one being asked. Shaped to match better-auth's
 * session user, so callers pass session.user directly rather than rebuilding an
 * object and risking passing the wrong id.
 */
export interface Principal {
  id: string;
  role?: string | null;
}

/**
 * Grants are read on nearly every request and change roughly never, so they
 * are cached per process for a few seconds.
 *
 * The window is short on purpose: an admin who removes a permission should see
 * it take effect while they are still looking at the screen, not minutes later
 * when they have stopped believing the toggle worked.
 */
const CACHE_TTL_MS = 10_000;

let roleCache: { grants: Map<string, Set<string>>; loadedAt: number } | null = null;
const userCache = new Map<string, { overrides: Map<string, boolean>; loadedAt: number }>();

/** Call after any write so the next check reflects it immediately. */
export function invalidatePermissionCache(userId?: string): void {
  if (userId) userCache.delete(userId);
  else {
    roleCache = null;
    userCache.clear();
  }
}

async function loadRoleGrants(db: Database): Promise<Map<string, Set<string>>> {
  if (roleCache && Date.now() - roleCache.loadedAt < CACHE_TTL_MS) return roleCache.grants;

  const rows = await db.select().from(rolePermission);
  const grants = new Map<string, Set<string>>();
  for (const row of rows) {
    const role = resolveRole(row.role);
    if (!grants.has(role)) grants.set(role, new Set());
    grants.get(role)!.add(row.permission);
  }

  roleCache = { grants, loadedAt: Date.now() };
  return grants;
}

async function loadUserOverrides(db: Database, userId: string): Promise<Map<string, boolean>> {
  const hit = userCache.get(userId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit.overrides;

  const rows = await db.select().from(userPermission).where(eq(userPermission.userId, userId));
  const overrides = new Map<string, boolean>(rows.map((r) => [r.permission, r.granted]));

  userCache.set(userId, { overrides, loadedAt: Date.now() });
  return overrides;
}

/**
 * Superadmin is not stored in either table and never checked against them.
 *
 * The permission editor is itself a permission, so a superadmin who could
 * revoke their own access would be one click from locking every path back in.
 * Hard-coding the bypass is what makes the feature safe to hand to someone.
 */
export function isUnrestricted(role?: string | null): boolean {
  return resolveRole(role) === Role.SUPERADMIN;
}

/** What the role alone gives — the baseline a user starts from. */
export async function roleBaseline(db: Database, role?: string | null): Promise<Set<string>> {
  if (isUnrestricted(role)) return new Set(PERMISSION_KEYS);
  const grants = await loadRoleGrants(db);
  return grants.get(resolveRole(role)) ?? new Set();
}

/**
 * What this person actually holds: their role's baseline, plus anything
 * granted to them individually, minus anything revoked from them.
 */
export async function effectivePermissions(
  db: Database,
  principal: Principal,
): Promise<Set<string>> {
  if (isUnrestricted(principal.role)) return new Set(PERMISSION_KEYS);

  const effective = new Set(await roleBaseline(db, principal.role));
  const overrides = await loadUserOverrides(db, principal.id);

  for (const [permission, granted] of overrides) {
    if (granted) effective.add(permission);
    else effective.delete(permission);
  }

  return effective;
}

/** Does this person hold this permission? */
export async function can(
  db: Database,
  principal: Principal,
  permission: string,
): Promise<boolean> {
  if (isUnrestricted(principal.role)) return true;
  // A permission that no longer exists in code cannot be held by anyone — a
  // stale row for a deleted page should stop mattering, not keep working.
  if (!isKnownPermission(permission)) return false;
  return (await effectivePermissions(db, principal)).has(permission);
}

/** True if they hold at least one of these. */
export async function canAny(
  db: Database,
  principal: Principal,
  permissions: string[],
): Promise<boolean> {
  if (isUnrestricted(principal.role)) return true;
  const held = await effectivePermissions(db, principal);
  return permissions.some((p) => isKnownPermission(p) && held.has(p));
}

/**
 * Everything they hold, for handing to the client in one go.
 *
 * A page that renders eight conditional controls should not make eight round
 * trips to answer the same question — the layout resolves the set once and
 * passes it down.
 */
export async function grantedPermissions(
  db: Database,
  principal: Principal,
): Promise<string[]> {
  const held = await effectivePermissions(db, principal);
  // Stale rows for permissions that no longer exist are dropped here rather
  // than shipped to the client, where they would light up controls for pages
  // that have since been removed.
  return [...held].filter(isKnownPermission);
}

// ── The editors ────────────────────────────────────────────────────────────

export interface RoleGrantRow {
  role: string;
  permissions: string[];
}

export async function allGrants(db: Database, roles: string[]): Promise<RoleGrantRow[]> {
  const rows = await db.select().from(rolePermission).where(inArray(rolePermission.role, roles));
  return roles.map((role) => ({
    role,
    permissions: rows.filter((r) => r.role === role).map((r) => r.permission),
  }));
}

export async function grantToRole(
  db: Database,
  role: string,
  permission: string,
  grantedByUserId?: string,
): Promise<void> {
  if (!isKnownPermission(permission)) throw new Error(`Unknown permission "${permission}"`);
  await db
    .insert(rolePermission)
    .values({ role: resolveRole(role), permission, grantedByUserId: grantedByUserId ?? null })
    .onConflictDoNothing({ target: [rolePermission.role, rolePermission.permission] });
  invalidatePermissionCache();
}

export async function revokeFromRole(
  db: Database,
  role: string,
  permission: string,
): Promise<void> {
  await db
    .delete(rolePermission)
    .where(
      and(eq(rolePermission.role, resolveRole(role)), eq(rolePermission.permission, permission)),
    );
  invalidatePermissionCache();
}

export interface UserPermissionState {
  permission: string;
  /** What the role gives before any override. */
  fromRole: boolean;
  /** null = inherit the role, true = granted here, false = revoked here. */
  override: boolean | null;
  /** What actually applies. */
  effective: boolean;
}

/** Every permission with its three-way state, for one person's detail page. */
export async function userPermissionMatrix(
  db: Database,
  principal: Principal,
): Promise<UserPermissionState[]> {
  const baseline = await roleBaseline(db, principal.role);
  const overrides = await loadUserOverrides(db, principal.id);

  return PERMISSION_KEYS.map((permission) => {
    const fromRole = baseline.has(permission);
    const override = overrides.has(permission) ? overrides.get(permission)! : null;
    return {
      permission,
      fromRole,
      override,
      effective: override === null ? fromRole : override,
    };
  });
}

/**
 * Set one person's override, or clear it back to inheriting the role.
 *
 * Clearing is not the same as revoking: a cleared permission follows the role
 * from then on, which is what someone means when they undo a change rather
 * than deny access.
 */
export async function setUserOverride(
  db: Database,
  userId: string,
  permission: string,
  override: boolean | null,
  grantedByUserId?: string,
): Promise<void> {
  if (!isKnownPermission(permission)) throw new Error(`Unknown permission "${permission}"`);

  if (override === null) {
    await db
      .delete(userPermission)
      .where(and(eq(userPermission.userId, userId), eq(userPermission.permission, permission)));
  } else {
    await db
      .insert(userPermission)
      .values({
        userId,
        permission,
        granted: override,
        grantedByUserId: grantedByUserId ?? null,
      })
      .onConflictDoUpdate({
        target: [userPermission.userId, userPermission.permission],
        set: { granted: override, grantedByUserId: grantedByUserId ?? null, updatedAt: new Date() },
      });
  }

  invalidatePermissionCache(userId);
}

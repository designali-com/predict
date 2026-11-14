import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { role as roleTable, rolePermission, user } from "./schema";
import type * as schema from "./schema";
import { Role, resolveRole } from "./roles";
import { invalidatePermissionCache } from "./permission-service";
import type { PermissionPanel } from "./permissions";
import { permissionsForPanel } from "./permissions";

type Database = NodePgDatabase<typeof schema>;

/**
 * The role catalogue, read from the database rather than from an enum.
 *
 * A clinic staffs roles the code cannot anticipate — therapist, lab
 * technician, front-desk manager. Permissions were already data (0011); this
 * makes the role itself data, so naming a new one is a form rather than a
 * deploy.
 *
 * ./roles.ts still exists and still matters: it names the handful of roles the
 * code itself reasons about (superadmin bypasses checks, patient triggers
 * onboarding). Those are seeded here as system roles and cannot be deleted.
 */

/** Which panel(s) a role works in. */
export const RoleScope = {
  CLINIC: "clinic",
  OPERATIONS: "operations",
  BOTH: "both",
  PATIENT: "patient",
} as const;

export type RoleScope = (typeof RoleScope)[keyof typeof RoleScope];

export interface RoleRecord {
  key: string;
  label: string;
  description: string | null;
  panel: RoleScope;
  isSystem: boolean;
  sortOrder: number;
}

export interface RoleWithUsage extends RoleRecord {
  userCount: number;
  permissionCount: number;
}

const CACHE_TTL_MS = 10_000;
let cache: { roles: RoleRecord[]; loadedAt: number } | null = null;

/** Call after any write so the next read reflects it immediately. */
export function invalidateRoleCache(): void {
  cache = null;
}

export async function listRoles(db: Database): Promise<RoleRecord[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.roles;

  const rows = await db
    .select()
    .from(roleTable)
    .orderBy(asc(roleTable.sortOrder), asc(roleTable.label));

  const roles: RoleRecord[] = rows.map((r) => ({
    key: r.key,
    label: r.label,
    description: r.description,
    panel: r.panel as RoleScope,
    isSystem: r.isSystem,
    sortOrder: r.sortOrder,
  }));

  cache = { roles, loadedAt: Date.now() };
  return roles;
}

export async function getRole(db: Database, key: string): Promise<RoleRecord | null> {
  const resolved = resolveRole(key);
  return (await listRoles(db)).find((r) => r.key === resolved) ?? null;
}

/** Roles a staff member can be given — everything that is not a patient role. */
export async function staffRoles(db: Database): Promise<RoleRecord[]> {
  return (await listRoles(db)).filter((r) => r.panel !== RoleScope.PATIENT);
}

/**
 * Which permission panels this role may be granted from.
 *
 * This is what keeps a doctor's permission table free of lead-nurture rows:
 * the pages a role can hold are bounded by where it works, so the list stays
 * the length of that person's actual job.
 */
export function panelsForScope(panel: RoleScope | string | null | undefined): PermissionPanel[] {
  switch (panel) {
    case RoleScope.CLINIC:
      return ["clinic"];
    case RoleScope.OPERATIONS:
      return ["operations"];
    case RoleScope.BOTH:
      return ["clinic", "operations"];
    default:
      return [];
  }
}

export async function panelsForRoleKey(
  db: Database,
  key?: string | null,
): Promise<PermissionPanel[]> {
  const record = await getRole(db, key ?? "");
  // An unknown role has no scope to bound it, so offering both panels is the
  // only honest answer — better a long list than a silently empty one.
  if (!record) return ["clinic", "operations"];
  return panelsForScope(record.panel);
}

/** Every permission key a role of this scope is allowed to hold. */
export async function grantablePermissions(db: Database, key?: string | null): Promise<string[]> {
  const panels = await panelsForRoleKey(db, key);
  return panels.flatMap((panel) => permissionsForPanel(panel).map((p) => p.key));
}

/**
 * Where a login for this role lands.
 *
 * A role that works in both panels is sent to the clinic panel because user
 * and role administration lives there; the operations console is one link
 * away. Anything without a scope — including a role that was deleted out from
 * under an account — falls back to the patient app, which is the only
 * destination that is safe for someone holding nothing.
 */
export async function landingPanelForRole(
  db: Database,
  key?: string | null,
): Promise<"clinic" | "operations" | "patient"> {
  const record = await getRole(db, key ?? "");
  if (!record) return "patient";
  if (record.panel === RoleScope.OPERATIONS) return "operations";
  if (record.panel === RoleScope.CLINIC || record.panel === RoleScope.BOTH) return "clinic";
  return "patient";
}

/**
 * A key is derived once, from the label, and then never changes — user.role
 * and role_permission.role both store it. Renaming is a label change, which is
 * exactly why label is a separate column.
 */
export function slugifyRoleKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "")
    .slice(0, 40);
}

const RESERVED_KEYS = new Set<string>(Object.values(Role));

/**
 * The only roles whose scope the code itself depends on.
 *
 * Every other built-in role — doctor, nutritionist, admin, health coach,
 * receptionist — is only where it is because that is how the clinic was
 * staffed on the day it was seeded, and clinics restaff. A receptionist who
 * books appointments and fills the registration form is working in the clinic
 * panel whatever the seed said, and locking that behind "built-in" left the
 * one person who could fix it unable to.
 *
 * These two stay fixed for reasons that are not preferences:
 *
 *   superadmin — bypasses the permission tables entirely. Moving it to the
 *     patient app would land the only account that can undo the change in the
 *     app with no admin pages in it.
 *   patient    — the code branches on it: onboarding, the patient dashboard,
 *     and staffRoles(), which builds the staff picker by excluding it. A
 *     patient scoped to the clinic would appear in the list of people to
 *     assign a chart to.
 */
const PANEL_LOCKED_ROLES = new Set<string>([Role.SUPERADMIN, Role.PATIENT, Role.USER]);

/** Whether this role's scope may be changed at all. */
export function canChangePanel(key: string): boolean {
  return !PANEL_LOCKED_ROLES.has(resolveRole(key));
}

export interface CreateRoleInput {
  label: string;
  description?: string | null;
  panel: RoleScope;
  /** Copy this role's pages as the starting point. */
  copyFrom?: string | null;
  actorId?: string | null;
}

export async function createRole(db: Database, input: CreateRoleInput): Promise<RoleRecord> {
  const label = input.label.trim();
  if (!label) throw new Error("A name is required.");

  const key = slugifyRoleKey(label);
  if (!key) throw new Error("That name has no letters or digits to build a key from.");
  if (RESERVED_KEYS.has(key)) throw new Error(`"${label}" is a built-in role and already exists.`);

  if (!panelsForScope(input.panel).length) {
    throw new Error("Choose which panel this role works in.");
  }

  const existing = await db.select().from(roleTable).where(eq(roleTable.key, key)).limit(1);
  if (existing.length) {
    throw new Error(`A role named "${existing[0]!.label}" already uses that key.`);
  }

  const [created] = await db
    .insert(roleTable)
    .values({
      key,
      label,
      description: input.description?.trim() || null,
      panel: input.panel,
      isSystem: false,
      createdByUserId: input.actorId ?? null,
    })
    .returning();

  // Cloning is the normal way a role is made: "like a nutritionist, minus two
  // pages" is a sentence someone can check, where thirty toggles from a blank
  // list is not. Only pages the new scope actually allows come across, so
  // copying a clinic role into an operations role cannot smuggle in rows that
  // role will never be able to show.
  if (input.copyFrom) {
    const allowed = new Set(await grantablePermissions(db, key));
    const source = await db
      .select({ permission: rolePermission.permission })
      .from(rolePermission)
      .where(eq(rolePermission.role, resolveRole(input.copyFrom)));

    const rows = source
      .filter((r) => allowed.has(r.permission))
      .map((r) => ({
        role: key,
        permission: r.permission,
        grantedByUserId: input.actorId ?? null,
      }));

    if (rows.length) await db.insert(rolePermission).values(rows).onConflictDoNothing();
  }

  invalidateRoleCache();
  invalidatePermissionCache();
  return {
    key: created!.key,
    label: created!.label,
    description: created!.description,
    panel: created!.panel as RoleScope,
    isSystem: created!.isSystem,
    sortOrder: created!.sortOrder,
  };
}

export interface UpdateRoleInput {
  label?: string;
  description?: string | null;
  panel?: RoleScope;
}

export async function updateRole(
  db: Database,
  key: string,
  input: UpdateRoleInput,
): Promise<RoleRecord> {
  const record = await getRole(db, key);
  if (!record) throw new Error("That role no longer exists.");

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw new Error("A name is required.");
    patch.label = label;
  }
  if (input.description !== undefined) patch.description = input.description?.trim() || null;

  if (input.panel !== undefined && input.panel !== record.panel) {
    if (!canChangePanel(record.key)) {
      throw new Error(
        record.key === Role.SUPERADMIN
          ? "Superadmin bypasses these tables and has to stay where it can reach them — moving it could lock the door with the key inside."
          : `${record.label} is the patient role — the code branches on it, so it cannot be moved into a staff panel.`,
      );
    }
    if (!panelsForScope(input.panel).length) {
      throw new Error("Choose which panel this role works in.");
    }
    patch.panel = input.panel;

    // Pages the new scope cannot show would linger as grants nothing renders,
    // and would reappear if the scope were ever moved back. Dropping them
    // keeps the stored grants and the visible table the same thing.
    const keep = new Set(
      panelsForScope(input.panel).flatMap((p) => permissionsForPanel(p).map((x) => x.key)),
    );
    const drop = (await grantablePermissions(db, record.key)).filter((k) => !keep.has(k));
    if (drop.length) {
      await db
        .delete(rolePermission)
        .where(
          and(eq(rolePermission.role, record.key), inArray(rolePermission.permission, drop)),
        );
    }
  }

  await db.update(roleTable).set(patch).where(eq(roleTable.key, record.key));
  invalidateRoleCache();
  // Grants are cached for a few seconds, so without this a scope change would
  // keep opening the pages it just dropped — long enough for whoever made the
  // change to conclude it did not work.
  invalidatePermissionCache();
  return (await getRole(db, record.key))!;
}

export async function deleteRole(db: Database, key: string): Promise<void> {
  const record = await getRole(db, key);
  if (!record) return;

  if (record.isSystem) {
    throw new Error(`${record.label} is a built-in role and cannot be deleted.`);
  }

  // Deleting a role out from under someone would leave an account holding a
  // key nothing describes, and landingPanelForRole would drop them into the
  // patient app with no explanation. Move them first.
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
    .where(eq(user.role, record.key));

  const count = row?.count ?? 0;
  if (count > 0) {
    throw new Error(
      `${count} ${count === 1 ? "person is" : "people are"} still assigned ${record.label}. Move them to another role first.`,
    );
  }

  // role_permission cascades — see migration 0013.
  await db.delete(roleTable).where(eq(roleTable.key, record.key));
  invalidateRoleCache();
  invalidatePermissionCache();
}

/** The catalogue plus what each role costs to change: who holds it, how many pages. */
export async function rolesWithUsage(db: Database): Promise<RoleWithUsage[]> {
  const roles = await listRoles(db);

  const userCounts = await db
    .select({ role: user.role, count: sql<number>`count(*)::int` })
    .from(user)
    .groupBy(user.role);

  const permCounts = await db
    .select({ role: rolePermission.role, count: sql<number>`count(*)::int` })
    .from(rolePermission)
    .groupBy(rolePermission.role);

  const users = new Map(userCounts.map((r) => [resolveRole(r.role), r.count]));
  const perms = new Map(permCounts.map((r) => [resolveRole(r.role), r.count]));

  return roles.map((r) => ({
    ...r,
    userCount: users.get(r.key) ?? 0,
    permissionCount: perms.get(r.key) ?? 0,
  }));
}

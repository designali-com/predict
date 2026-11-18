import { cookies, headers } from "next/headers";
import { db } from "@workspace/db/client";
import { can } from "@workspace/db/permission-service";
import { resolveActiveClinic, type Clinic, type Membership } from "@workspace/db/clinic-service";
import { auth } from "./auth";

/**
 * Which clinic this request is acting inside.
 *
 * The browser may *ask* for a clinic (the switcher writes a cookie), but the
 * answer always comes from the membership rows: a cookie naming a clinic
 * somebody does not belong to is ignored, not obeyed. That single rule is
 * what keeps one clinic's leads out of another clinic's screens.
 *
 * The role is resolved per clinic too — the same person can be a telecaller
 * in one and a manager in another — so permission checks are made against
 * the role they hold *here*, not a global one.
 */

export const ACTIVE_CLINIC_COOKIE = "active_clinic";

export interface ClinicContext {
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  clinic: Clinic;
  /** The role held in this clinic. */
  role: string;
  memberships: Membership[];
  /** The signed-in user with their clinic role — what permission checks use. */
  principal: { id: string; role: string };
}

export async function clinicContext(): Promise<ClinicContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const requested = (await cookies()).get(ACTIVE_CLINIC_COOKIE)?.value ?? null;
  const resolved = await resolveActiveClinic(db, session.user, requested);
  if (!resolved) return null;

  return {
    session,
    clinic: resolved.clinic,
    role: resolved.role,
    memberships: resolved.memberships,
    principal: { id: session.user.id, role: resolved.role },
  };
}

/**
 * The clinic context plus a permission check against the role held there.
 * Returns null for "not signed in", "belongs to no clinic" and "not allowed
 * here" alike — every one of them ends the same way for the caller.
 */
export async function requireClinicPermission(permission: string): Promise<ClinicContext | null> {
  const context = await clinicContext();
  if (!context) return null;
  if (!(await can(db, context.principal, permission))) return null;
  return context;
}

/** Any one of these is enough — for a route several areas can reach. */
export async function requireClinicAnyPermission(permissions: string[]): Promise<ClinicContext | null> {
  const context = await clinicContext();
  if (!context) return null;
  for (const permission of permissions) {
    if (await can(db, context.principal, permission)) return context;
  }
  return null;
}

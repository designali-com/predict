import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@workspace/db/client"
import { resolveActiveClinic } from "@workspace/db/clinic-service"
import { moduleAllows } from "@workspace/db/clinic-modules"
import {
  can,
  canAny,
  grantedPermissions,
  isUnrestricted,
  type Principal,
} from "@workspace/db/permission-service"
import { CLINIC_KEYS, OPS_KEYS, WORK_KEYS, routeForPermission } from "@workspace/db/permissions"
import { landingPanelForRole } from "@workspace/db/role-service"
import { auth } from "./auth"
import { ACTIVE_CLINIC_COOKIE, isPredictStaff } from "./clinic"
import { DEFAULT_LOGIN_REDIRECT, OPERATIONS_URL, PATIENT_URL } from "./config"

/**
 * Page guards, resolved from what a role has been granted rather than from a
 * hard-coded list of roles.
 *
 * The point of the indirection: adding a role used to mean editing every
 * config that named roles explicitly. Now a new role starts with nothing and
 * is handed pages from the permission editor, with no deploy.
 *
 * Every guard also asks the clinic: a permission says what the role may do, a
 * module says whether this clinic does that at all, and both have to allow it.
 */

/**
 * The clinic row whose modules apply to this request. Null when the account
 * belongs to no clinic (a superadmin, say) — moduleAllows reads that as every
 * module, so the permission alone decides.
 */
async function activeClinicRow(principal: Principal) {
  const requested = (await cookies()).get(ACTIVE_CLINIC_COOKIE)?.value ?? null
  return (await resolveActiveClinic(db, principal, requested))?.clinic ?? null
}

/** The permissions in this list that the active clinic's modules let through. */
async function allowedByModules(principal: Principal, permissions: string[]): Promise<string[]> {
  const clinic = await activeClinicRow(principal)
  const predictStaff = await isPredictStaff(principal.role, principal)
  return permissions.filter((permission) => moduleAllows(clinic, permission, { predictStaff }))
}
export async function requirePermission(permission: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const open = await allowedByModules(session.user, [permission])
  if (open.length === 0 || !(await can(db, session.user, permission))) {
    // Somewhere they can actually go, not a login form that would just sign
    // them straight back in to the same refusal.
    redirect(await panelRedirectFor(session.user))
  }
  return session
}

/** For a layout that several permissions can open — any one is enough. */
export async function requireAnyPermission(permissions: string[]) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const open = await allowedByModules(session.user, permissions)
  if (open.length === 0 || !(await canAny(db, session.user, open))) {
    redirect(await panelRedirectFor(session.user))
  }
  return session
}

/** Resolve once in a layout and pass down, rather than re-asking per control. */
export async function sessionPermissions(): Promise<string[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return []
  return allowedByModules(session.user, await grantedPermissions(db, session.user))
}

/**
 * The pages worth putting in this account's sidebar.
 *
 * Same as what they hold, except for an unrestricted one. Superadmin bypasses
 * the permission tables, so its grant list is every page in the product rather
 * than a description of the job — which is how the platform owner ended up
 * with a Book Appointment screen in their navigation. The doing pages come
 * out; the numbers from them live on the dashboard instead.
 *
 * Navigation only. A superadmin who types the URL still gets in, which is what
 * an owner of last resort is for.
 */
export async function sessionNavPermissions(): Promise<string[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return []

  const held = await allowedByModules(session.user, await grantedPermissions(db, session.user))
  if (!isUnrestricted(session.user.role)) return held

  const work = new Set(WORK_KEYS)
  return held.filter((key) => !work.has(key))
}

/** For API routes: null when unauthorised, the session when allowed. */
export async function requireApiPermission(permission: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  if ((await allowedByModules(session.user, [permission])).length === 0) return null
  if (!(await can(db, session.user, permission))) return null
  return session
}

/** Same, for a route that more than one page's permission may open. */
export async function requireApiAnyPermission(permissions: string[]) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const open = await allowedByModules(session.user, permissions)
  if (open.length === 0 || !(await canAny(db, session.user, open))) return null
  return session
}

/**
 * Which panel this role can actually open, read from its grants.
 *
 * A role created from the Roles page had no entry in the hard-coded map this
 * replaced, so the synchronous version sent it to the patient app. This one
 * asks what the account was actually granted, which is the whole point of the
 * feature.
 */
export async function panelRedirectFor(principal: Principal): Promise<string> {
  // Only what the clinic's modules let through — otherwise a page refused for
  // its module could send them to another page the same module closes, and
  // round again.
  const held = new Set(await allowedByModules(principal, await grantedPermissions(db, principal)))

  // An area dashboard if they hold one, most privileged first.
  for (const [key, href] of AREA_HOMES) {
    if (held.has(key)) return href
  }

  // Otherwise any clinic page they actually hold. Falling back to a fixed
  // route instead was a redirect loop waiting to happen: a role granted
  // Patients but not Dashboard was sent to the Dashboard, refused, and sent
  // there again.
  for (const key of CLINIC_KEYS) {
    if (held.has(key)) return routeForPermission(key) ?? DEFAULT_LOGIN_REDIRECT
  }

  if (OPS_KEYS.some((key) => held.has(key))) return OPERATIONS_URL

  // Nothing at all. Someone whose role works here but has not been given a
  // page yet is not a patient, and sending them to the patient app would say
  // they were. They get told what is missing instead.
  return (await landingPanelForRole(db, principal.role)) === "patient"
    ? PATIENT_URL
    : "/no-access"
}

// There is one dashboard now, so there is one home. This used to be a list of
// four, one per role-shaped area, and picking between them was the only reason
// the redirect needed to know anything about roles at all.
const AREA_HOMES: [string, string][] = [["clinic.home", "/dashboard"]];


import { db } from "@workspace/db/client"
import { canAny, type Principal } from "@workspace/db/permission-service"
import { CLINIC_KEYS, OPS_KEYS, routeForPermission } from "@workspace/db/permissions"
import { grantedPermissions } from "@workspace/db/permission-service"
import { landingPanelForRole } from "@workspace/db/role-service"

/**
 * The other two panels. Absolute, because they are separate origins — a
 * relative path would land on this app's 404 instead.
 */
export const CLINIC_URL = process.env.NEXT_PUBLIC_CLINIC_URL ?? "http://localhost:3002"
export const PATIENT_URL = process.env.NEXT_PUBLIC_PATIENT_URL ?? "http://localhost:3000"

/**
 * Where a signed-in person belongs, read from what their role was granted
 * rather than from a hard-coded list.
 *
 * Server-only: it touches the database, and importing it from a client
 * component would drag `pg` into the browser bundle.
 *
 * This is the single place that answers "after login, where?" for this app —
 * the login form pushes to "/" and lets the root page ask.
 */
export async function panelRedirectFor(principal: Principal): Promise<string> {
  const held = new Set(await grantedPermissions(db, principal))

  if (held.has("ops.home")) return "/home"

  // Home is a page like any other and can be withheld, so fall back to
  // whichever page they do hold rather than to a route that would refuse them
  // and redirect here again.
  for (const key of OPS_KEYS) {
    if (held.has(key)) return routeForPermission(key) ?? "/home"
  }

  if (CLINIC_KEYS.some((key) => held.has(key))) return CLINIC_URL

  // Works here on paper, but holds no page yet — better to say so than to
  // drop them into the patient app as if they were a patient.
  return (await landingPanelForRole(db, principal.role)) === "patient"
    ? PATIENT_URL
    : "/no-access"
}

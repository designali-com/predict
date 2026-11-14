import { db } from "@workspace/db/client"
import { canAny, type Principal } from "@workspace/db/permission-service"
import { landingPanelForRole } from "@workspace/db/role-service"
import { CLINIC_KEYS, OPS_KEYS } from "@workspace/db/permissions"
import { CLINIC_URL, DEFAULT_LOGIN_REDIRECT, OPERATIONS_URL } from "./config"

/**
 * Where a staff account belongs, read from what it was actually granted.
 *
 * The role-shaped version this replaces could only recognise roles named in
 * code, so a role created from the Roles page — "therapist" — fell through to
 * the patient dashboard, which is the one place it does not belong.
 *
 * Server-only: it touches the database, and importing it from a client
 * component would drag `pg` into the browser bundle.
 */
export async function isStaffPrincipal(principal: Principal): Promise<boolean> {
  if (await canAny(db, principal, [...CLINIC_KEYS, ...OPS_KEYS])) return true
  // A role that works in a staff panel but has not been granted a page yet is
  // still staff. Without this they would quietly get the patient dashboard,
  // which is the one place their account does not belong.
  return (await landingPanelForRole(db, principal.role)) !== "patient"
}

export async function panelRedirectFor(principal: Principal): Promise<string> {
  if (await canAny(db, principal, CLINIC_KEYS)) return CLINIC_URL
  if (await canAny(db, principal, OPS_KEYS)) return OPERATIONS_URL

  // Staff with nothing granted go to the panel their role names, which tells
  // them what is missing. Each panel's own guard sorts out the rest.
  const scope = await landingPanelForRole(db, principal.role)
  if (scope === "clinic") return CLINIC_URL
  if (scope === "operations") return OPERATIONS_URL
  return DEFAULT_LOGIN_REDIRECT
}

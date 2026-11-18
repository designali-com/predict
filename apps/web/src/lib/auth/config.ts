import { STAFF_ROLES, hasRole, isAdminRole, resolveRole } from "@workspace/db/roles";

/**
 * This app is the public site and the patient's own product. Nothing else.
 *
 * Every staff role was moved out — clinical work to the clinic panel, funnel
 * and phone work to the operations console — so the only thing role handling
 * does here is recognise a staff account and send it to the right place. There
 * is no staff surface left to fall back to.
 */
export const DEFAULT_LOGIN_REDIRECT = "/dashboard";

// Separate origins, so these have to be absolute — a relative path would land
// on this app's 404 rather than the other panel.
export const CLINIC_URL = process.env.NEXT_PUBLIC_CLINIC_URL ?? "http://localhost:3002";
export const OPERATIONS_URL = process.env.NEXT_PUBLIC_OPERATIONS_URL ?? "http://localhost:3001";

// Where a staff account belongs is answered by panelRedirectFor() in
// ./panel.ts, from the pages it was actually granted. The role-shaped version
// that used to live here could only recognise roles named in code, so a role
// created from the Roles page fell through to the patient dashboard.

export { STAFF_ROLES, hasRole, isAdminRole, resolveRole };

/**
 * Whether this session may read a *different* patient's clinical data.
 *
 * Always false, and that is the point. Every staff role moved to the clinic
 * panel, so a session in this app is always the patient themselves — the
 * `?userId=` escape hatch on the routes below now has no legitimate caller
 * here. Kept as a named check rather than deleted so those routes still say
 * what they are guarding, and so putting staff back in this app has to be a
 * deliberate change rather than an accident.
 */
export function canReadAnotherPatient(): boolean {
  return false;
}

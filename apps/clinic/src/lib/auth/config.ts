import { Role, STAFF_ROLES, hasRole, isAdminRole, resolveRole } from "@workspace/db/roles";

/**
 * Where each panel lives. The three apps are separate origins, so anything
 * that sends someone to another one has to be an absolute URL — a relative
 * path would land on this app's 404 instead.
 */
export const PATIENT_URL = process.env.NEXT_PUBLIC_PATIENT_URL ?? "http://localhost:3000";
export const OPERATIONS_URL = process.env.NEXT_PUBLIC_OPERATIONS_URL ?? "http://localhost:3001";
/** This panel. */
export const CLINIC_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3002";
/**
 * The lab (lab.predict.fit) — this same app, answering on its own host with
 * only the lab section (see src/proxy.ts). Unset: no separate host, /lab only.
 */
export const LAB_URL = process.env.NEXT_PUBLIC_LAB_URL ?? null;

export const DEFAULT_LOGIN_REDIRECT = "/dashboard";

// Where a signed-in person belongs is answered by panelRedirectFor() in
// ./permissions.ts, from the pages they were actually granted. The
// role-shaped version that used to live here could only recognise roles named
// in code, so a role created from the Roles page fell through to the patient
// app — the one place a staff account does not belong.

// Directory access is narrower than appointment access: doctors and
// nutritionists need to read visits and leave notes without being able to
// manage accounts.
export function canViewUserDirectory(role?: string | null): boolean {
  return isAdminRole(role) || hasRole(role, [Role.DOCTOR, Role.HEALTH_COACH]);
}

// canManageAppointments() used to live here: a hard-coded list of role names
// that decided who could book, look up a number, or open a visit. It left the
// receptionist out — so granting her the Appointments page did nothing and
// every call came back Unauthorized — and it could never have answered for a
// role a clinic invented on the Roles page. Those routes check the
// clinic.appointments permission now, which is the thing the grant actually
// sets.

export { STAFF_ROLES, hasRole, isAdminRole, resolveRole };

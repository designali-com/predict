// The one list of roles the whole system agrees on.
//
// It has to be shared, and the reason is specific: better-auth validates every
// role value against the `roles` map each app declares, and rejects anything
// missing as a "non-existent role" — even for roles that carry no admin
// permission at all. With the panel split across three apps that map exists
// three times, so a role added to two of them and forgotten in the third fails
// only on whichever app happens to be doing the assigning. Declaring it once
// here and deriving each app's map from it makes that impossible.
//
// user.role is plain text in the database, not an enum, so this list is the
// only thing that makes it meaningful.

export const Role = {
  /** The default. A patient using the product themselves. */
  USER: "user",
  /** Same thing, written the other way by older rows. */
  PATIENT: "patient",

  // Clinical — work in the clinic panel, against a patient's chart.
  DOCTOR: "doctor",
  NUTRITIONIST: "nutritionist",
  /** A doctor at a partner hospital — sees only that hospital's patients. */
  PARTNER_DOCTOR: "partner_doctor",
  /** Predict lab team — works the blood-test orders on lab.predict.fit. */
  LAB_STAFF: "lab_staff",
  /** Takes blood samples at home or the centre — sees only their own visits. */
  FIELD_TECHNICIAN: "field_technician",

  // Operations — work in the operations console, against the funnel and phone.
  HEALTH_COACH: "health_coach",
  RECEPTIONIST: "receptionist",

  // Administrative — cross-cutting by nature, at home in both panels.
  ADMIN: "admin",
  SUPERADMIN: "superadmin",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: Role[] = Object.values(Role);

/** Anyone who is not a patient — i.e. never lands on the patient dashboard. */
export const STAFF_ROLES: Role[] = [
  Role.SUPERADMIN,
  Role.ADMIN,
  Role.DOCTOR,
  Role.NUTRITIONIST,
  Role.HEALTH_COACH,
  Role.RECEPTIONIST,
  Role.PARTNER_DOCTOR,
  Role.LAB_STAFF,
  Role.FIELD_TECHNICIAN,
];

/** Roles better-auth should grant real admin-API permissions to. */
export const ADMIN_ROLES: Role[] = [Role.ADMIN, Role.SUPERADMIN];

// Mistyped values already sitting in the database. Resolving them here means a
// typo costs a wrong label, not someone's access.
const ROLE_ALIASES: Record<string, Role> = {
  neutritionsit: Role.NUTRITIONIST,
  nutritionists: Role.NUTRITIONIST,
  healthcoach: Role.HEALTH_COACH,
  "health-coach": Role.HEALTH_COACH,
};

export function resolveRole(role?: string | null): string {
  const normalized = (role ?? "").trim().toLowerCase();
  return ROLE_ALIASES[normalized] ?? normalized;
}

export function hasRole(role: string | null | undefined, allowed: readonly string[]): boolean {
  return allowed.includes(resolveRole(role));
}

export function isAdminRole(role?: string | null): boolean {
  return hasRole(role, ADMIN_ROLES);
}

export function isStaffRole(role?: string | null): boolean {
  return hasRole(role, STAFF_ROLES);
}

// Where a role works is NOT decided here. It used to be — a function on this
// file mapped each role to a panel — and it was wrong twice over: it could not
// answer for a role a clinic invented, and it hard-coded receptionist as
// operations-only, which stopped being true the moment the registration form
// and the appointment book moved into the clinic panel. Scope is a column on
// the role row now, editable from the Roles page; see landingPanelForRole in
// ./role-service.ts.

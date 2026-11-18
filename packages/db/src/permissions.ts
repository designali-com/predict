// One permission per page in a sidebar. Nothing finer, nothing else.
//
// An earlier version mixed page access with action-level rights (send a
// broadcast, import a CSV, assign a care plan) and the result was unreadable:
// a doctor's permission list showed lead-nurture controls that have no meaning
// in the clinical panel at all. Actions belong to the page that hosts them —
// if you can open People, you can do the things on People.
//
// So the list below is exactly the left-hand navigation of both panels, with
// the route each entry opens. That makes it checkable by eye: every row is a
// page you can visit, and every page you can visit is a row.
//
// The list is code, the grants are data. A permission only means something if
// the page behind it exists, so it cannot be typed into a database — but who
// holds it changes with how a clinic is staffed, so that must not be a deploy.

export const PermissionPanel = {
  CLINIC: "clinic",
  OPERATIONS: "operations",
} as const;

export type PermissionPanel = (typeof PermissionPanel)[keyof typeof PermissionPanel];

export interface PermissionDef {
  key: string;
  panel: PermissionPanel;
  /** The sidebar section this sits under. */
  area: string;
  /** Exactly the label shown in the sidebar. */
  label: string;
  /** The route it opens — shown in the editor so there is no guessing. */
  route: string;
  /**
   * Whether this page is somewhere work gets done, or somewhere the system
   * gets administered.
   *
   * It exists for one reason: superadmin bypasses the permission tables and so
   * "holds" every page, which is not a description of the job. Handing the
   * platform owner a Book Appointment screen is offering them somebody else's
   * work — they need the numbers out of it, not the form. Navigation uses this
   * to leave the doing pages off an unrestricted account's sidebar.
   *
   * It is not an access control. A superadmin who types the URL still gets in,
   * which is what an owner of last resort is for.
   */
  kind?: "work" | "admin";
}

export const PERMISSIONS: PermissionDef[] = [
  // ── Clinic ───────────────────────────────────────────────────────────
  //
  // Named for the work, not for who does it. The routes used to start with a
  // role — /doctor/patient, /nutritionist/appointments — which was fine while
  // roles were an enum and wrong the moment a clinic could invent one: a
  // therapist granted the patient list would open a page addressed to a
  // doctor, and hold a permission with "doctor" in its name.
  //
  // Merging them also collapses the duplicates. Patients appeared three times
  // and Appointments twice, identical but for the prefix, so the editor had
  // twenty-nine rows where the clinic panel really has nine pages.
  { key: "clinic.home", panel: "clinic", area: "Clinic", label: "Dashboard", route: "/dashboard" },
  { key: "clinic.patients", panel: "clinic", area: "Clinic", label: "Patients", route: "/patients", kind: "work" },
  { key: "clinic.appointments", panel: "clinic", area: "Clinic", label: "Appointments", route: "/appointments", kind: "work" },
  // Was "Directory": three hard-coded role cards, a list of names, and one
  // doctor month-calendar that printed "No appointments — free" on days the
  // doctor was on leave. The names duplicated /team; the calendar was the only
  // thing here that existed nowhere else, and it was wrong.
  { key: "clinic.schedule", panel: "clinic", area: "Clinic", label: "Schedule", route: "/schedule", kind: "work" },
  // A clinician's own working hours and leave. Its own page because it is the
  // one thing on the clinical side somebody maintains about themselves rather
  // than about a patient.
  { key: "clinic.availability", panel: "clinic", area: "Clinic", label: "My Availability", route: "/availability", kind: "work" },
  // Money taken at the desk. Its own page because it is the one thing on the
  // clinical side that is not clinical — and because the consultation fee is
  // what lets a visit reach a doctor at all, somebody has to be able to take it.
  { key: "clinic.billing", panel: "clinic", area: "Clinic", label: "Billing", route: "/billing", kind: "work" },
  // Not a page: on Billing, every expense rather than only your own, the
  // profit figure, voiding an expense and the monthly repeats. Anyone with
  // Billing can enter an expense; salaries and the margin stay with this.
  { key: "clinic.expenses_all", panel: "clinic", area: "Clinic", label: "Billing — all expenses & profit", route: "/billing", kind: "work" },
  // Blood-test orders from every clinic and partner hospital — collection,
  // payment, report. Opens on lab.predict.fit; see app/lab.
  { key: "clinic.lab", panel: "clinic", area: "Clinic", label: "Lab", route: "/lab", kind: "work" },
  // A field technician's own visits — mark on the way, collected (kit code),
  // not collected. Nothing else. Opens on lab.predict.fit/field.
  { key: "clinic.field", panel: "clinic", area: "Clinic", label: "Field visits", route: "/field", kind: "work" },

  // ── Clinic · Administration ───────────────────────────────────────────
  { key: "clinic.reports", panel: "clinic", area: "Administration", label: "Reports", route: "/reports" },
  { key: "clinic.team", panel: "clinic", area: "Administration", label: "Team", route: "/team" },
  { key: "clinic.roles", panel: "clinic", area: "Administration", label: "Roles", route: "/roles" },
  { key: "clinic.biomarkers", panel: "clinic", area: "Administration", label: "Biomarkers", route: "/biomarkers" },
  { key: "clinic.ai", panel: "clinic", area: "Administration", label: "AI Assistant", route: "/ai" },
  { key: "clinic.care_plan_library", panel: "clinic", area: "Administration", label: "Care Plan Library", route: "/care-plan-library" },
  { key: "clinic.treatment_plans", panel: "clinic", area: "Administration", label: "Treatment Plans", route: "/treatment-plans" },
  // The storeroom. Its own permission because counting stock is a different
  // job from prescribing it — and the person who does it is often neither the
  // doctor nor the front desk.
  { key: "clinic.stock", panel: "clinic", area: "Administration", label: "Medicine Stock", route: "/stock" },
  // The clinic's own details — name, address, GSTIN, registration no. — as
  // they print on receipts and reports. Admin by default.
  { key: "clinic.settings", panel: "clinic", area: "Administration", label: "Settings", route: "/settings" },

  // ── Operations · Work ─────────────────────────────────────────────────
  { key: "ops.home", panel: "operations", area: "Home", label: "Home", route: "/home" },
  { key: "ops.inbox", panel: "operations", area: "Work", label: "Inbox", route: "/conversations", kind: "work" },
  // Two lists, not one screen with a stage filter, because they are two jobs.
  // Chasing an enquiry and looking after someone under care need different
  // people at most clinics, and while they shared a permission there was no way
  // to staff the first without handing over the clinical record of every
  // patient in the building. Which stages sit on which list is decided once, in
  // @workspace/db/contact-side.
  { key: "ops.leads", panel: "operations", area: "Work", label: "Leads", route: "/leads", kind: "work" },
  // Not a page: widens Leads from "assigned to me or my role" to every lead.
  // A telecaller role gets ops.leads alone; a manager gets both.
  { key: "ops.leads_all", panel: "operations", area: "Work", label: "Leads — see all (not only assigned)", route: "/leads", kind: "work" },
  { key: "ops.patients", panel: "operations", area: "Work", label: "Patients", route: "/patients", kind: "work" },
  { key: "ops.tasks", panel: "operations", area: "Work", label: "Tasks", route: "/tasks", kind: "work" },
  { key: "ops.appointments", panel: "operations", area: "Work", label: "Appointments", route: "/appointments", kind: "work" },

  // ── Operations · Automation ───────────────────────────────────────────
  { key: "ops.reports", panel: "operations", area: "Automation", label: "Reports", route: "/reports" },
  { key: "ops.campaigns", panel: "operations", area: "Automation", label: "Campaigns", route: "/campaigns" },
  { key: "ops.flows", panel: "operations", area: "Automation", label: "Flows", route: "/flows" },

  // ── Operations · Setup ────────────────────────────────────────────────
  { key: "ops.templates", panel: "operations", area: "Setup", label: "Templates", route: "/templates" },
  { key: "ops.media", panel: "operations", area: "Setup", label: "Media", route: "/stock" },
  { key: "ops.audiences", panel: "operations", area: "Setup", label: "Audiences", route: "/audience" },
  { key: "ops.lead_routing", panel: "operations", area: "Setup", label: "Lead routing", route: "/lead-routing" },
  { key: "ops.ai_replies", panel: "operations", area: "Setup", label: "AI replies", route: "/ai-replies" },
  { key: "ops.automation_settings", panel: "operations", area: "Setup", label: "Automation settings", route: "/automation-settings" },
  { key: "ops.clinics", panel: "operations", area: "Setup", label: "Clinics", route: "/clinics" },
];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS: string[] = PERMISSIONS.map((p) => p.key);

export function permissionsForPanel(panel: PermissionPanel): PermissionDef[] {
  return PERMISSIONS.filter((p) => p.panel === panel);
}

/**
 * Every page in one area of a panel — "clinic." or "ops." and so on.
 *
 * An area's layout admits anyone holding any page inside it, and each page
 * then checks its own. Guarding the layout on the area's Dashboard instead
 * made every other page in the area hostage to it: a role granted Patients but
 * not Dashboard was refused at the layout, so the toggle it was given did
 * nothing.
 */
export function permissionKeysWithPrefix(prefix: string): string[] {
  return PERMISSION_KEYS.filter((key) => key.startsWith(prefix));
}

/** The route a permission opens, or undefined if it names no page. */
export function routeForPermission(key: string): string | undefined {
  return PERMISSIONS.find((p) => p.key === key)?.route;
}

/** The pages that are somebody's daily work rather than administration. */
export const WORK_KEYS: string[] = PERMISSIONS.filter((p) => p.kind === "work").map((p) => p.key);

export function isKnownPermission(key: unknown): key is string {
  return typeof key === "string" && PERMISSION_KEYS.includes(key);
}

/**
 * Opening a panel at all is just holding any page in it — there is no separate
 * "access" permission to forget to tick, and no way to be granted pages you
 * cannot reach.
 */
export const CLINIC_KEYS: string[] = permissionsForPanel("clinic").map((p) => p.key);
export const OPS_KEYS: string[] = permissionsForPanel("operations").map((p) => p.key);

// Which panel's pages are worth showing when configuring a role used to be
// decided here, by a list of role names. It could not answer for a role it had
// never heard of, which is every role a clinic creates for itself — so the
// question moved to ./role-service.ts, where each role carries its own scope.

/**
 * The starting set for each role — the pages that role could already reach.
 *
 * Applied by the seed script only. Once a role has rows, this file has no
 * further say, or every deploy would quietly undo whatever was configured.
 */
export const DEFAULT_GRANTS: Record<string, string[]> = {
  doctor: [
    "clinic.home",
    "clinic.patients",
    "clinic.appointments",
    "clinic.schedule",
    "clinic.availability",
    "clinic.care_plan_library",
  ],
  nutritionist: [
    "clinic.home",
    "clinic.patients",
    "clinic.appointments",
    "clinic.schedule",
    "clinic.availability",
    "clinic.care_plan_library",
  ],
  admin: [
    "clinic.home",
    "clinic.patients",
    "clinic.appointments",
    "clinic.schedule",
    "clinic.team",
    "clinic.reports",
    "clinic.care_plan_library",
    "clinic.treatment_plans",
    "clinic.stock",
    "clinic.billing",
    "clinic.expenses_all",
    ...OPS_KEYS,
  ],
  health_coach: ["ops.home", "ops.inbox", "ops.leads", "ops.leads_all", "ops.tasks", "ops.appointments"],
  receptionist: [
    "ops.home",
    "ops.leads",
    "ops.leads_all",
    "ops.patients",
    "ops.appointments",
    "ops.inbox",
    "clinic.home",
    "clinic.appointments",
    "clinic.patients",
    "clinic.schedule",
    "clinic.billing",
  ],
};

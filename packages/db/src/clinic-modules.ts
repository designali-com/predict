// What a clinic uses of the panel — client-safe, no database.
//
// A clinic is OPTM, Apollo or any hospital: it has patients, and some of
// appointments, therapy courses, medicine and billing. Diagnosis — blood
// tests and biomarkers, muscle age, biological age, wearables — is Predict's,
// which the clinics refer to; a clinic without the module does not see it.
//
// A permission names what a role may do; a module says whether the clinic does
// that at all. Both have to allow it. Patients, the dashboard, settings, the
// team and roles belong to no module: every clinic has them.

export const CLINIC_MODULES = [
  { key: "appointments", label: "Appointments", hint: "Consultations, the schedule and doctors' availability" },
  { key: "therapy", label: "Therapy", hint: "Treatment plans, courses, sittings and the therapy calendar" },
  { key: "medicine", label: "Medicine", hint: "Medicine stock, package issues and counter sales" },
  { key: "billing", label: "Billing", hint: "Payments, dues, expenses and receipts" },
  { key: "diagnosis", label: "Diagnosis (Predict)", hint: "Blood tests, biomarkers, muscle age, biological age, wearables" },
] as const;

export type ClinicModule = (typeof CLINIC_MODULES)[number]["key"];

export const ALL_MODULES: ClinicModule[] = CLINIC_MODULES.map((m) => m.key);

export function isClinicModule(v: unknown): v is ClinicModule {
  return CLINIC_MODULES.some((m) => m.key === v);
}

/**
 * The module each permission belongs to. Not listed = every clinic has it.
 *
 * clinic.lab is left out on purpose: the lab panel is Predict's own (its own
 * host), used by Predict's lab staff whichever clinic they are signed in to.
 * Its link in the clinic sidebar follows the module instead — see NAV_MODULE.
 */
export const PERMISSION_MODULE: Record<string, ClinicModule> = {
  "clinic.appointments": "appointments",
  "clinic.availability": "appointments",
  "clinic.treatment_plans": "therapy",
  "clinic.stock": "medicine",
  "clinic.billing": "billing",
  "clinic.biomarkers": "diagnosis",
  "clinic.field": "diagnosis",
};

/** Sidebar links that follow a module beyond their permission's. */
export const NAV_MODULE: Record<string, ClinicModule> = {
  "/schedule": "appointments",
  "/therapy": "therapy",
  "/lab": "diagnosis",
  "/biomarkers": "diagnosis",
  "/field": "diagnosis",
};

/** The modules a clinic row has switched on; unknown keys are dropped. */
export function clinicModules(clinic: { modules?: string[] | null } | null | undefined): Set<ClinicModule> {
  if (!clinic?.modules) return new Set(ALL_MODULES);
  return new Set(clinic.modules.filter(isClinicModule));
}

/**
 * Whether a clinic's modules let this permission through at all.
 *
 * predictStaff: Predict's own people (superadmin, the lab) keep Diagnosis in
 * any clinic — it is their work, done for the patients clinics refer to them.
 */
export function moduleAllows(
  clinic: { modules?: string[] | null } | null | undefined,
  permission: string,
  opts: { predictStaff?: boolean } = {},
): boolean {
  const needs = PERMISSION_MODULE[permission];
  if (!needs) return true;
  if (needs === "diagnosis" && opts.predictStaff) return true;
  return clinicModules(clinic).has(needs);
}

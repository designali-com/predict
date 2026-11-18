import { cookies, headers } from "next/headers";
import { db } from "@workspace/db/client";
import { can } from "@workspace/db/permission-service";
import { isSuperadmin, resolveActiveClinic, type Clinic, type Membership } from "@workspace/db/clinic-service";
import { moduleAllows } from "@workspace/db/clinic-modules";
import { auth } from "./auth";
import { canViewUserDirectory } from "./config";

/**
 * Which clinic this request is acting inside — the clinic panel's copy of the
 * same rule the operations console follows.
 *
 * The browser may ask for a clinic (the switcher writes a cookie), but the
 * answer comes from the membership rows. A doctor sits at one clinic; the
 * patients, appointments and bills they see are that clinic's, and a cookie
 * naming another one changes nothing.
 */

export const ACTIVE_CLINIC_COOKIE = "active_clinic";

export interface ClinicContext {
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  clinic: Clinic;
  /** The role held in this clinic, which permission checks are made against. */
  role: string;
  memberships: Membership[];
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
 * Predict's own people: superadmin, and the lab, which works across clinics.
 * They keep the Diagnosis pages in a clinic that has the module off, to do
 * the work for the patients that clinic refers to Predict.
 */
export async function isPredictStaff(globalRole: string | null | undefined, principal: { id: string; role?: string | null }) {
  return isSuperadmin(globalRole) || can(db, principal, "clinic.lab");
}

/** For API routes: the clinic context, or null if they may not act here. */
export async function requireClinicApiPermission(permission: string): Promise<ClinicContext | null> {
  const context = await clinicContext();
  if (!context) return null;
  const predictStaff = await isPredictStaff(context.session.user.role, context.principal);
  if (!moduleAllows(context.clinic, permission, { predictStaff })) return null;
  if (!(await can(db, context.principal, permission))) return null;
  return context;
}

/**
 * Filing a blood report on someone else's chart.
 *
 * The user directory stays closed to a nutritionist — that list is who may
 * manage accounts. Filing the sheet they just registered the patient for is
 * the Patients page, which they do hold. A health coach keeps the older
 * role check, which is how they reached this before the page permission existed.
 */
export async function mayFilePatientReport(role?: string | null): Promise<boolean> {
  if (canViewUserDirectory(role)) return true;
  const context = await clinicContext();
  if (!context) return false;
  // The lab files the reports for the orders it works.
  return (await can(db, context.principal, "clinic.patients")) || can(db, context.principal, "clinic.lab");
}

export async function requireClinicApiAnyPermission(permissions: string[]): Promise<ClinicContext | null> {
  const context = await clinicContext();
  if (!context) return null;
  const predictStaff = await isPredictStaff(context.session.user.role, context.principal);
  for (const permission of permissions) {
    if (!moduleAllows(context.clinic, permission, { predictStaff })) continue;
    if (await can(db, context.principal, permission)) return context;
  }
  return null;
}

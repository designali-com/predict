import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, eq } from "drizzle-orm";
import { clinic, clinicMember, user } from "./schema";
import type * as schema from "./schema";
import { resolveRole } from "./roles";

type Db = NodePgDatabase<typeof schema>;

export type Clinic = typeof clinic.$inferSelect;

/**
 * Which clinic a request is acting inside, and who may act there.
 *
 * Everything in the product belongs to exactly one clinic. A member works in
 * one (or, later, several); a superadmin stands outside all of them and sees
 * every clinic. The one rule that must never bend: the clinic a request acts
 * in is decided here, from the database, never from what the browser sent.
 */

export function isSuperadmin(role: string | null | undefined): boolean {
  return resolveRole(role) === "superadmin";
}

/** What a clinic is: one of ours, or a partner hospital. */
export const ClinicKind = { CLINIC: "clinic", PARTNER: "partner" } as const;

export const isPartnerClinic = (c: { kind?: string | null } | null | undefined) => c?.kind === ClinicKind.PARTNER;

export async function listClinics(db: Db, includeInactive = false): Promise<Clinic[]> {
  const rows = await db.select().from(clinic).orderBy(asc(clinic.createdAt));
  return includeInactive ? rows : rows.filter((c) => c.isActive);
}

/**
 * The clinic to fall back to when nothing else says which — the first one
 * opened. Used by intake paths that run before anybody has chosen a clinic
 * (a lead arriving at 3am belongs somewhere, even if no rule matched).
 */
export async function defaultClinicId(db: Db): Promise<string | null> {
  // Never a partner hospital: a lead nobody routed is ours to call.
  const [first] = await db
    .select({ id: clinic.id })
    .from(clinic)
    .where(eq(clinic.kind, ClinicKind.CLINIC))
    .orderBy(asc(clinic.createdAt))
    .limit(1);
  return first?.id ?? null;
}

export async function clinicBySlug(db: Db, slug: string): Promise<Clinic | null> {
  const [row] = await db.select().from(clinic).where(eq(clinic.slug, slug)).limit(1);
  return row ?? null;
}

export interface Membership {
  clinic: Clinic;
  /** The role this person holds *here*, which may differ per clinic. */
  role: string;
}

/**
 * The clinics this person can work in, with the role they hold in each.
 *
 * A superadmin gets every clinic without a membership row — they are not
 * staff anywhere, they own the whole thing.
 */
export async function membershipsFor(
  db: Db,
  principal: { id: string; role?: string | null },
): Promise<Membership[]> {
  if (isSuperadmin(principal.role)) {
    const all = await listClinics(db);
    return all.map((c) => ({ clinic: c, role: "superadmin" }));
  }

  const rows = await db
    .select({ clinic, role: clinicMember.role })
    .from(clinicMember)
    .innerJoin(clinic, eq(clinic.id, clinicMember.clinicId))
    .where(and(eq(clinicMember.userId, principal.id), eq(clinicMember.isActive, true)))
    .orderBy(asc(clinic.createdAt));

  const memberships = rows
    .filter((r) => r.clinic.isActive)
    .map((r) => ({ clinic: r.clinic, role: resolveRole(r.role) }));
  if (memberships.length > 0) return memberships;

  // No membership row yet — an account created before multi-clinic, or one
  // an admin has not placed anywhere. Fall back to the first clinic with
  // their global role so nobody is locked out mid-migration.
  if (!principal.role || ["user", "patient"].includes(resolveRole(principal.role))) return [];
  const [first] = await listClinics(db);
  return first ? [{ clinic: first, role: resolveRole(principal.role) }] : [];
}

/**
 * The clinic to act in for this request: the one asked for when the person
 * belongs to it, otherwise their first. Returns null when they belong
 * nowhere — the caller turns that into "no access", never into "all clinics".
 */
export async function resolveActiveClinic(
  db: Db,
  principal: { id: string; role?: string | null },
  requestedClinicId?: string | null,
): Promise<{ clinic: Clinic; role: string; memberships: Membership[] } | null> {
  const memberships = await membershipsFor(db, principal);
  if (memberships.length === 0) return null;

  const wanted = requestedClinicId
    ? memberships.find((m) => m.clinic.id === requestedClinicId)
    : undefined;
  const chosen = wanted ?? memberships[0]!;
  return { clinic: chosen.clinic, role: chosen.role, memberships };
}

/** Is this person allowed to act in this clinic at all? */
export async function canAccessClinic(
  db: Db,
  principal: { id: string; role?: string | null },
  clinicId: string,
): Promise<boolean> {
  if (isSuperadmin(principal.role)) return true;
  const memberships = await membershipsFor(db, principal);
  return memberships.some((m) => m.clinic.id === clinicId);
}

export interface ClinicInput {
  name: string;
  slug: string;
  city?: string | null;
  state?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  registrationNo?: string | null;
  footerNote?: string | null;
  consentText?: string | null;
  legalName?: string | null;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string;
  /** clinic | partner — see clinic.kind. */
  kind?: string;
  isActive?: boolean;
  /** Its brand — see clinic.shortName and the logo columns. */
  shortName?: string | null;
  logoUrl?: string | null;
  logoDarkUrl?: string | null;
  iconUrl?: string | null;
  brandColor?: string | null;
  receiptPrefix?: string;
  modules?: string[];
}

/** OPTM, PXA — upper-case letters and digits, what a receipt number starts with. */
export function cleanReceiptPrefix(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length >= 2 && s.length <= 8 ? s : null;
}

/** A hex colour (#1a7f5a), or null. */
export function cleanBrandColor(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

export async function createClinic(db: Db, input: ClinicInput): Promise<Clinic> {
  const [row] = await db.insert(clinic).values(input).returning();
  return row!;
}

export async function updateClinic(db: Db, id: string, input: Partial<ClinicInput>): Promise<Clinic | null> {
  const [row] = await db
    .update(clinic)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(clinic.id, id))
    .returning();
  return row ?? null;
}

export interface ClinicStaff {
  userId: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

export async function clinicStaff(db: Db, clinicId: string): Promise<ClinicStaff[]> {
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: clinicMember.role,
      isActive: clinicMember.isActive,
    })
    .from(clinicMember)
    .innerJoin(user, eq(user.id, clinicMember.userId))
    .where(eq(clinicMember.clinicId, clinicId))
    .orderBy(asc(user.name));
  return rows;
}

/** Put somebody in a clinic, or change the role they hold there. */
export async function setMembership(
  db: Db,
  params: { clinicId: string; userId: string; role: string; isActive?: boolean },
): Promise<void> {
  await db
    .insert(clinicMember)
    .values({
      clinicId: params.clinicId,
      userId: params.userId,
      role: resolveRole(params.role),
      isActive: params.isActive ?? true,
    })
    .onConflictDoUpdate({
      target: [clinicMember.clinicId, clinicMember.userId],
      set: { role: resolveRole(params.role), isActive: params.isActive ?? true },
    });
}

export async function removeMembership(db: Db, clinicId: string, userId: string): Promise<void> {
  await db
    .delete(clinicMember)
    .where(and(eq(clinicMember.clinicId, clinicId), eq(clinicMember.userId, userId)));
}

/**
 * Predict's own clinic: the one that does diagnosis and no treatment
 * (modules include "diagnosis" but neither "appointments" nor "therapy").
 * Where somebody who signs up on the predict.fit app belongs — the app,
 * blood tests and biomarkers are Predict's. Null when there is none.
 */
export async function predictClinicId(db: Db): Promise<string | null> {
  const rows = await db
    .select({ id: clinic.id, modules: clinic.modules })
    .from(clinic)
    .where(and(eq(clinic.kind, ClinicKind.CLINIC), eq(clinic.isActive, true)))
    .orderBy(asc(clinic.createdAt));
  const own = rows.find(
    (c) => c.modules?.includes("diagnosis") && !c.modules.includes("appointments") && !c.modules.includes("therapy"),
  );
  return own?.id ?? null;
}

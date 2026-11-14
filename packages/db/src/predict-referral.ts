import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, count, desc, eq, inArray, max } from "drizzle-orm";
import {
  biologicalAgeResult,
  biomarkerReading,
  bloodTestOrder,
  clinic,
  patientRecord,
  predictReferral,
  user,
  valdTest,
} from "./schema";
import type * as schema from "./schema";
import { ensurePatientLogin } from "./login-link";

type Db = NodePgDatabase<typeof schema>;

/**
 * Referring a clinic's patient to Predict.
 *
 * OPTM, Apollo or any hospital keeps the patient. What Predict does — blood
 * tests and biomarkers, muscle age, biological age, wearables — the clinic
 * refers them for. The referral is where the patient's consent is recorded,
 * and the one moment a predict.fit login is made for a clinic's patient.
 * Predict's results then come back onto the clinic's chart, read-only.
 */

export const REFERRAL_SERVICES = [
  { key: "blood_test", label: "Blood test & biomarkers" },
  { key: "muscle_age", label: "Muscle age (VALD)" },
  { key: "biological_age", label: "Biological age" },
  { key: "wearables", label: "Wearables" },
] as const;

export type ReferralService = (typeof REFERRAL_SERVICES)[number]["key"];

export const ReferralStatus = {
  REFERRED: "referred",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type ReferralStatus = (typeof ReferralStatus)[keyof typeof ReferralStatus];

const OPEN: string[] = [ReferralStatus.REFERRED, ReferralStatus.IN_PROGRESS];

export function isReferralService(v: unknown): v is ReferralService {
  return REFERRAL_SERVICES.some((s) => s.key === v);
}

export type ReferResult =
  | { ok: true; referralId: string; loginCreated: boolean; loginError: string | null }
  | { ok: false; error: string };

/**
 * Refer the patient. Refused without consent, and while an open referral
 * already covers the same services — one patient, one live referral.
 *
 * The login is attempted but does not decide the referral: a chart with no
 * mobile, or a number already on another account, still gets referred, and
 * the reason comes back so staff can fix it from the chart.
 */
export async function referToPredict(
  db: Db,
  params: {
    patientId: string;
    clinicId: string;
    services: ReferralService[];
    consent: boolean;
    note?: string | null;
    actorUserId: string | null;
  },
): Promise<ReferResult> {
  if (!params.consent) return { ok: false, error: "The patient's consent is needed to share their details with Predict" };
  const services = [...new Set(params.services)];
  if (services.length === 0) return { ok: false, error: "Pick at least one thing to refer them for" };

  const chart = await db.query.patientRecord.findFirst({
    columns: { id: true, contactId: true },
    where: eq(patientRecord.id, params.patientId),
  });
  if (!chart) return { ok: false, error: "Patient not found" };

  const open = await db
    .select({ services: predictReferral.services })
    .from(predictReferral)
    .where(and(eq(predictReferral.patientId, chart.id), inArray(predictReferral.status, OPEN)));
  const covered = new Set(open.flatMap((r) => r.services));
  if (services.every((s) => covered.has(s))) {
    return { ok: false, error: "An open referral already covers this" };
  }

  const now = new Date();
  const [row] = await db
    .insert(predictReferral)
    .values({
      patientId: chart.id,
      contactId: chart.contactId,
      clinicId: params.clinicId,
      services,
      note: params.note?.trim() || null,
      consentAt: now,
      consentByUserId: params.actorUserId,
      createdByUserId: params.actorUserId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: predictReferral.id });

  const login = await ensurePatientLogin(db, chart.id);
  return {
    ok: true,
    referralId: row!.id,
    loginCreated: login.ok && login.created,
    loginError: login.ok ? null : login.error,
  };
}

export async function referralsFor(db: Db, patientId: string) {
  return db
    .select({
      id: predictReferral.id,
      services: predictReferral.services,
      status: predictReferral.status,
      note: predictReferral.note,
      consentAt: predictReferral.consentAt,
      createdAt: predictReferral.createdAt,
      referredBy: user.name,
    })
    .from(predictReferral)
    .leftJoin(user, eq(user.id, predictReferral.createdByUserId))
    .where(eq(predictReferral.patientId, patientId))
    .orderBy(desc(predictReferral.createdAt));
}

/** Has this patient ever been referred? Decides whether Predict's results show on the chart. */
export async function isReferred(db: Db, patientId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(predictReferral)
    .where(eq(predictReferral.patientId, patientId));
  return (row?.n ?? 0) > 0;
}

export async function setReferralStatus(
  db: Db,
  referralId: string,
  clinicId: string,
  status: ReferralStatus,
): Promise<boolean> {
  const rows = await db
    .update(predictReferral)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(predictReferral.id, referralId), eq(predictReferral.clinicId, clinicId)))
    .returning({ id: predictReferral.id });
  return rows.length > 0;
}

/**
 * What Predict has found, for the referring clinic's chart. A summary only —
 * the latest of each — and nothing here can be edited from the clinic's side.
 */
export async function predictResults(db: Db, patientId: string) {
  const [age] = await db
    .select({
      biologicalAge: biologicalAgeResult.biologicalAge,
      chronologicalAge: biologicalAgeResult.chronologicalAge,
      deltaAge: biologicalAgeResult.deltaAge,
      calculatedAt: biologicalAgeResult.calculatedAt,
    })
    .from(biologicalAgeResult)
    .where(eq(biologicalAgeResult.patientId, patientId))
    .orderBy(desc(biologicalAgeResult.calculatedAt))
    .limit(1);

  const [readings] = await db
    .select({ n: count(), lastOn: max(biomarkerReading.collectedOn) })
    .from(biomarkerReading)
    .where(eq(biomarkerReading.patientId, patientId));

  const bloodTests = await db
    .select({
      id: bloodTestOrder.id,
      status: bloodTestOrder.status,
      orderedOn: bloodTestOrder.orderedOn,
      collectedOn: bloodTestOrder.collectedOn,
    })
    .from(bloodTestOrder)
    .where(eq(bloodTestOrder.patientId, patientId))
    .orderBy(desc(bloodTestOrder.orderedOn))
    .limit(5);

  const [vald] = await db
    .select({ n: count(), lastAt: max(valdTest.testedAt) })
    .from(valdTest)
    .where(eq(valdTest.patientId, patientId));

  return {
    biologicalAge: age ?? null,
    biomarkers: { count: readings?.n ?? 0, lastOn: readings?.lastOn ?? null },
    bloodTests,
    vald: { count: vald?.n ?? 0, lastAt: vald?.lastAt ?? null },
  };
}

/* ------------------------------------------------------------ Predict's side */

/**
 * Predict's queue: referrals from every clinic and partner hospital, newest
 * first. Open ones by default — referred and with Predict.
 */
export async function listReferrals(db: Db, opts: { status?: ReferralStatus | "open" | null } = {}) {
  const status = opts.status ?? "open";
  return db
    .select({
      id: predictReferral.id,
      services: predictReferral.services,
      status: predictReferral.status,
      note: predictReferral.note,
      createdAt: predictReferral.createdAt,
      patientId: predictReferral.patientId,
      contactId: predictReferral.contactId,
      patientCode: patientRecord.patientCode,
      firstName: patientRecord.firstName,
      lastName: patientRecord.lastName,
      mobile: patientRecord.mobileNumber,
      clinicName: clinic.name,
      clinicShortName: clinic.shortName,
      referredBy: user.name,
    })
    .from(predictReferral)
    .innerJoin(patientRecord, eq(patientRecord.id, predictReferral.patientId))
    .innerJoin(clinic, eq(clinic.id, predictReferral.clinicId))
    .leftJoin(user, eq(user.id, predictReferral.createdByUserId))
    .where(status === "open" ? inArray(predictReferral.status, OPEN) : eq(predictReferral.status, status))
    .orderBy(desc(predictReferral.createdAt))
    .limit(200);
}

export async function referralCounts(db: Db): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: predictReferral.status, n: count() })
    .from(predictReferral)
    .groupBy(predictReferral.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/** Predict moving a referral on. Any clinic's — this is Predict's queue. */
export async function moveReferral(db: Db, referralId: string, status: ReferralStatus): Promise<boolean> {
  const rows = await db
    .update(predictReferral)
    .set({ status, updatedAt: new Date() })
    .where(eq(predictReferral.id, referralId))
    .returning({ id: predictReferral.id });
  return rows.length > 0;
}

/**
 * Work has started for this patient (a blood test was ordered): their waiting
 * referrals are now with Predict. Nothing happens for a patient never referred.
 */
export async function startReferralsFor(db: Db, patientId: string): Promise<void> {
  await db
    .update(predictReferral)
    .set({ status: ReferralStatus.IN_PROGRESS, updatedAt: new Date() })
    .where(and(eq(predictReferral.patientId, patientId), eq(predictReferral.status, ReferralStatus.REFERRED)));
}

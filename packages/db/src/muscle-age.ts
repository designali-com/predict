import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { patientRecord, valdAssessment, valdTest } from "./schema";
import type * as schema from "./schema";
import { assessGrip, GRIP_AGE_DISCLAIMER, type Sex } from "./grip-norms";
import { STUB_DATE_OF_BIRTH, isGenderKnown } from "./registration-sync";
import { sidesForRow } from "./vald";

type Database = NodePgDatabase<typeof schema>;

/**
 * Muscle age from DynaMo tests.
 *
 * STRENGTH — "muscle age" is the age at which the patient's result is the
 * average for their sex, and the percentile is where it sits among people of
 * their own age. That needs a published reference curve per test. Today there
 * is one: handgrip (Dodds et al. 2014, ./grip-norms.ts). A test without a
 * reference gets no muscle age rather than a guessed one; when a reference is
 * added to STRENGTH_REFERENCES, its tests start counting, and the day's muscle
 * age is taken over all of them.
 *
 * ROM — range of motion is not strength and has no "age". It is reported as a
 * share of the normal range (AAOS normal values), which is what a clinician
 * reads it against.
 *
 * Neither is a diagnosis; MUSCLE_AGE_DISCLAIMER says so wherever they appear.
 */

export const MUSCLE_AGE_DISCLAIMER = `${GRIP_AGE_DISCLAIMER} Range of motion is compared with AAOS normal ranges.`;

const NEWTONS_PER_KG = 9.80665;

interface StrengthReference {
  source: string;
  /** Muscle age, percentile and expected value for the stronger side, in kg. */
  assess: (peakKg: number, age: number, sex: Sex) => { muscleAge: number; percentile: number; expectedKg: number };
}

/**
 * Tests with a published strength reference, keyed "Region|Movement".
 * Add a test here (with its source) and it counts towards muscle age.
 */
const STRENGTH_REFERENCES: Record<string, StrengthReference> = {
  "Hand|GripSqueeze": {
    source: "Dodds et al. 2014 (handgrip)",
    assess: (peakKg, age, sex) => {
      const g = assessGrip({ peakKg, ageYears: age, sex });
      // The curve is flat before its peak (30), so a strong grip in someone
      // younger resolves to 30 — older than they are. It means "at least as
      // strong as the peak", which for them is their own age.
      const muscleAge = age < 30 && g.gripAgeYears <= 30 && peakKg >= g.expectedKg ? age : g.gripAgeYears;
      return { muscleAge, percentile: g.percentile, expectedKg: g.expectedKg };
    },
  },
};

/**
 * Normal active range, degrees — AAOS (American Academy of Orthopaedic
 * Surgeons) reference values, keyed "Region|Movement", or
 * "Region|Movement|Position" where the DynaMo's start position decides what is
 * measured. Left out on purpose: movements measured towards 0° (knee and elbow
 * extension); shoulder extension, which the DynaMo reads on a different arc
 * from the clinical one (tests here range 67°–233°); and seated knee flexion,
 * which starts from 90° and so is not the full range.
 */
const ROM_NORMAL: Record<string, number> = {
  "Shoulder|Flexion": 180,
  "Shoulder|Abduction": 180,
  "Shoulder|ExternalRotation": 90,
  "Shoulder|InternalRotation": 70,
  "Elbow|Flexion": 150,
  "Wrist|Flexion": 80,
  "Wrist|Extension": 70,
  "Wrist|RadialDeviation": 20,
  "Wrist|UlnarDeviation": 30,
  // VALD spells it this way.
  "Wrist|UlnaDeviation": 30,
  // Forearm rotation, measured at the wrist on the DynaMo.
  "Wrist|Pronation": 80,
  "Wrist|Supination": 80,
  "Hip|Flexion": 120,
  "Hip|Extension": 30,
  "Hip|Abduction": 45,
  "Hip|Adduction": 30,
  "Hip|InternalRotation": 45,
  "Hip|ExternalRotation": 45,
  "Knee|Flexion|Prone": 135,
  "Ankle|Dorsiflexion": 20,
  "Ankle|PlantarFlexion": 50,
  "Ankle|Plantarflexion": 50,
  "Ankle|Inversion": 35,
  "Ankle|Eversion": 15,
  "Neck|Flexion": 45,
  "Neck|Extension": 45,
  "Neck|LateralFlexionLeft": 45,
  "Neck|LateralFlexionRight": 45,
  "Neck|RotationLeft": 60,
  "Neck|RotationRight": 60,
  "Trunk|Flexion": 80,
  "Trunk|Extension": 25,
  "Trunk|LateralFlexionLeft": 35,
  "Trunk|LateralFlexionRight": 35,
  "Trunk|RotationLeft": 45,
  "Trunk|RotationRight": 45,
};

const round1 = (n: number) => Math.round(n * 10) / 10;

type Row = typeof valdTest.$inferSelect;

/** The age (whole years) of someone born on `dob` on `at`. */
function ageAt(dob: string, at: Date): number | null {
  const d = new Date(`${dob.slice(0, 10)}T00:00:00Z`);
  let age = at.getUTCFullYear() - d.getUTCFullYear();
  if (at.getUTCMonth() < d.getUTCMonth() || (at.getUTCMonth() === d.getUTCMonth() && at.getUTCDate() < d.getUTCDate())) age--;
  return age > 0 && age < 120 ? age : null;
}

/** Age and sex the patient had at the test: as recorded with it, else from the chart. */
function profileFor(row: Row, chart: typeof patientRecord.$inferSelect): { age: number | null; sex: Sex | null } {
  const p = (row.raw as { profile?: { age?: unknown; sex?: unknown } } | null)?.profile;
  const recordedAge = Number(p?.age);
  const age =
    Number.isFinite(recordedAge) && recordedAge > 0
      ? Math.round(recordedAge)
      : chart.dateOfBirth && chart.dateOfBirth !== STUB_DATE_OF_BIRTH
        ? ageAt(String(chart.dateOfBirth), row.testedAt)
        : null;
  const rawSex = typeof p?.sex === "string" ? p.sex.toLowerCase() : isGenderKnown(chart.gender) ? chart.gender.toLowerCase() : "";
  const sex: Sex | null = rawSex === "male" ? "male" : rawSex === "female" ? "female" : null;
  return { age, sex };
}

export interface TestAssessment {
  assessedAge: number | null;
  assessedSex: string | null;
  muscleAge: number | null;
  strengthPercentile: number | null;
  expectedNewtons: number | null;
  romPercentOfNormal: number | null;
  normSource: string | null;
}

/** Muscle age (strength) or share of normal (ROM) for one test. */
export function assessTest(row: Row, age: number | null, sex: Sex | null): TestAssessment {
  const out: TestAssessment = {
    assessedAge: age,
    assessedSex: sex,
    muscleAge: null,
    strengthPercentile: null,
    expectedNewtons: null,
    romPercentOfNormal: null,
    normSource: null,
  };
  const key = `${row.bodyRegion}|${row.movement}`;
  const sides = sidesForRow(row);
  if (row.testCategory === "RangeofMotion") {
    const normal = ROM_NORMAL[`${key}|${row.position}`] ?? ROM_NORMAL[key];
    const values = [sides?.left?.rangeOfMotionDegrees, sides?.right?.rangeOfMotionDegrees].filter(
      (v): v is number => typeof v === "number" && v > 0,
    );
    if (normal && values.length) {
      // Each side against normal, averaged — a stiff side shows as the share
      // drops. Past normal is "full range", not more than full.
      const pct = values.reduce((s, v) => s + Math.min(100, (v / normal) * 100), 0) / values.length;
      out.romPercentOfNormal = Math.round(pct);
      out.normSource = "AAOS normal range";
    }
    return out;
  }
  const ref = STRENGTH_REFERENCES[key];
  const peaks = [sides?.left?.peakForceNewtons, sides?.right?.peakForceNewtons].filter(
    (v): v is number => typeof v === "number" && v > 0,
  );
  if (!ref || !peaks.length || age == null || !sex) return out;
  // The reference describes the stronger hand.
  const peakKg = Math.max(...peaks) / NEWTONS_PER_KG;
  const r = ref.assess(peakKg, age, sex);
  out.muscleAge = round1(r.muscleAge);
  out.strengthPercentile = r.percentile;
  out.expectedNewtons = Math.round(r.expectedKg * NEWTONS_PER_KG);
  out.normSource = ref.source;
  return out;
}

const clinicDay = (at: Date) => new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * Work out (again) every test of one patient and their per-day muscle age.
 * Cheap — a patient has tens of tests — so it is simply redone after a save.
 */
export async function refreshMuscleAge(db: Database, patientId: string): Promise<void> {
  const [chart] = await db.select().from(patientRecord).where(eq(patientRecord.id, patientId)).limit(1);
  if (!chart) return;
  const rows = await db.select().from(valdTest).where(eq(valdTest.patientId, patientId)).orderBy(asc(valdTest.testedAt));

  const byDay = new Map<string, { row: Row; a: TestAssessment }[]>();
  for (const row of rows) {
    const { age, sex } = profileFor(row, chart);
    const a = assessTest(row, age, sex);
    await db.update(valdTest).set(a).where(eq(valdTest.id, row.id));
    const day = clinicDay(row.testedAt);
    byDay.set(day, [...(byDay.get(day) ?? []), { row, a }]);
  }

  for (const [day, list] of byDay) {
    // One result per kind of test that day: the last one taken.
    const latest = new Map<string, { row: Row; a: TestAssessment }>();
    for (const x of list) if (x.a.muscleAge != null) latest.set(`${x.row.bodyRegion}|${x.row.movement}`, x);
    const used = [...latest.values()];
    const grip = latest.get("Hand|GripSqueeze") ?? null;
    const first = list[0]!;
    const values = {
      patientId,
      day,
      appointmentId: list.find((x) => x.row.appointmentId)?.row.appointmentId ?? null,
      actualAge: first.a.assessedAge,
      sex: first.a.assessedSex,
      muscleAge: used.length ? round1(used.reduce((s, x) => s + x.a.muscleAge!, 0) / used.length) : null,
      gripMuscleAge: grip?.a.muscleAge ?? null,
      gripPercentile: grip?.a.strengthPercentile ?? null,
      tests: used.map((x) => ({
        testId: x.row.id,
        region: x.row.bodyRegion,
        movement: x.row.movement,
        muscleAge: x.a.muscleAge,
        percentile: x.a.strengthPercentile,
        source: x.a.normSource,
      })),
      computedAt: new Date(),
    };
    await db
      .insert(valdAssessment)
      .values(values)
      .onConflictDoUpdate({ target: [valdAssessment.patientId, valdAssessment.day], set: values });
  }
}

/** The day's muscle age for a report, and the visits before it for a trend. */
export async function muscleAgeHistory(db: Database, patientId: string, upTo?: string) {
  const rows = await db
    .select()
    .from(valdAssessment)
    .where(and(eq(valdAssessment.patientId, patientId), ...(upTo ? [lt(valdAssessment.day, nextDay(upTo))] : []), gte(valdAssessment.day, "2000-01-01")))
    .orderBy(asc(valdAssessment.day));
  return rows.filter((r) => r.muscleAge != null);
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

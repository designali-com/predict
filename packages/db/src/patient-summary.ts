import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { appointment, clinicalFormSubmission, patientRecord, user, valdTest } from "./schema";
import type * as schema from "./schema";
import { formByKey, formFields } from "./clinical-forms";
import { anthropometrics, womacTotals } from "./form-scoring";
import { patientPrintContext, getDietProtocol } from "./diet-protocol-store";
import { getExerciseProtocol } from "./exercise-protocol-store";
import { getExerciseHistory, type ExerciseHistory } from "./exercise-history";
import { listValdTestTypes } from "./vald-test-types";
import { checkinsBetween } from "./checkin-log";
import { CHECKINS } from "./checkin";

type Db = NodePgDatabase<typeof schema>;

/**
 * Everything the clinic has found about a patient, gathered for one screen
 * the doctor turns towards the patient after the assessment: why they came,
 * how much it hurts, what was measured, how the two sides compare, what the
 * DynaMo found — and the plan, exercise and diet, that follows from it.
 *
 * Read-only. Each part is null or empty when that work has not been done, so
 * the screen shows what there is and leaves the rest out.
 */

const VISIT_FORMS = ["registration_front_desk", "registration_clinical", "questionnaire", "measurements", "provisional_diagnosis", "nutrition_consult"];

export type Tone = "good" | "fair" | "poor" | "neutral";

export interface Stat {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  tone: Tone;
}

export interface SidePair {
  label: string;
  unit: string;
  right: number;
  left: number;
  /** |R − L| ÷ the larger, in %. */
  asymmetry: number;
}

export interface PatientSummary {
  patient: { name: string; code: string | null; age: number | null; gender: string | null };
  clinic: { name: string; brandColor: string | null; logoUrl: string | null } | null;
  lastVisit: { date: string; doctor: string | null } | null;
  visitsCount: number;
  complaints: { complaints: string[]; locations: string[]; painAreas: string[]; duration: string | null; triggers: string[] };
  diagnosis: { conditions: string[]; notes: string | null };
  pain: {
    /** 0–4 per region, from the Ganguly scale (4 = extremely). */
    regions: { region: string; score: number; answer: string }[];
    womac: { pain: number | null; stiffness: number | null; function: number | null; total: number | null } | null;
  };
  vitals: Stat[];
  body: Stat[];
  sides: SidePair[];
  vald: {
    label: string;
    region: string;
    kind: "force" | "rom";
    unit: string;
    left: number | null;
    right: number | null;
    asymmetry: number | null;
    testedAt: string;
  }[];
  trend: { date: string; womac: number | null; weight: number | null; bmi: number | null }[];
  exercise: {
    current: ExerciseHistory | null;
    plan: {
      title: string;
      duration: string;
      schedule: string;
      active: boolean;
      exercises: { name: string; dose: string }[];
      checkInRunning: boolean;
    } | null;
    /** Last 30 days of the daily WhatsApp check-in. */
    adherence: { done: number; partial: number; missed: number } | null;
  };
  diet: { title: string; badge: string; diet: string | null; meals: number; avoid: string[] } | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const fixed = (n: number | null, d = 1) => (n == null ? "—" : n.toFixed(d).replace(/\.0+$/, ""));
const day = (d: Date) => d.toISOString();

const GANGULY_SCORE: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, E: 0 };

function bpTone(sys: number | null, dia: number | null): { tone: Tone; note: string } {
  if (sys == null || dia == null) return { tone: "neutral", note: "" };
  if (sys >= 140 || dia >= 90) return { tone: "poor", note: "High" };
  if (sys >= 130 || dia >= 85) return { tone: "fair", note: "Slightly high" };
  if (sys < 90 || dia < 60) return { tone: "fair", note: "Low" };
  return { tone: "good", note: "Normal" };
}

/** Asian cut-offs, as Indian clinics use them. */
function bmiTone(bmi: number | null): { tone: Tone; note: string } {
  if (bmi == null) return { tone: "neutral", note: "" };
  if (bmi < 18.5) return { tone: "fair", note: "Underweight" };
  if (bmi < 23) return { tone: "good", note: "Healthy" };
  if (bmi < 25) return { tone: "fair", note: "Overweight" };
  return { tone: "poor", note: "Obese" };
}

function range(value: number | null, good: [number, number], fair: [number, number]): Tone {
  if (value == null) return "neutral";
  if (value >= good[0] && value <= good[1]) return "good";
  if (value >= fair[0] && value <= fair[1]) return "fair";
  return "poor";
}

/** Field labels of a form, by key. */
function labels(formKey: string): Map<string, string> {
  const form = formByKey(formKey);
  return new Map(form ? formFields(form).map((f) => [f.key, f.label]) : []);
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : typeof v === "string" && v.trim() ? [v] : []);

export async function patientSummary(db: Db, contactId: string): Promise<PatientSummary> {
  const context = await patientPrintContext(db, contactId);
  const [chart] = await db.select({ id: patientRecord.id }).from(patientRecord).where(eq(patientRecord.contactId, contactId)).limit(1);

  // Every visit form, oldest first; the latest answer to a form wins.
  const rows = await db
    .select({
      formKey: clinicalFormSubmission.formKey,
      answers: clinicalFormSubmission.answers,
      appointmentId: clinicalFormSubmission.appointmentId,
      at: appointment.scheduledAt,
      doctor: user.name,
    })
    .from(clinicalFormSubmission)
    .innerJoin(appointment, eq(appointment.id, clinicalFormSubmission.appointmentId))
    .leftJoin(user, eq(user.id, appointment.doctorUserId))
    .where(and(eq(clinicalFormSubmission.contactId, contactId), inArray(clinicalFormSubmission.formKey, VISIT_FORMS), isNotNull(clinicalFormSubmission.appointmentId)))
    .orderBy(asc(appointment.scheduledAt), asc(clinicalFormSubmission.updatedAt));

  const latest = new Map<string, Record<string, unknown>>();
  const visits = new Map<string, { at: Date; doctor: string | null; forms: Map<string, Record<string, unknown>> }>();
  for (const r of rows) {
    const answers = (r.answers ?? {}) as Record<string, unknown>;
    if (Object.keys(answers).length === 0) continue;
    latest.set(r.formKey, answers);
    const v = visits.get(r.appointmentId!) ?? { at: r.at, doctor: r.doctor, forms: new Map() };
    v.forms.set(r.formKey, answers);
    visits.set(r.appointmentId!, v);
  }
  const visitList = [...visits.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
  const last = visitList.at(-1);

  // Why they came.
  const front = latest.get("registration_front_desk") ?? {};
  const clinical = latest.get("registration_clinical") ?? {};
  const frontLabels = labels("registration_front_desk");
  const painAreas = Object.entries(front)
    .filter(([k, v]) => k.startsWith("pain_") && (v === true || (typeof v === "string" && v.trim())))
    .map(([k, v]) => `${frontLabels.get(k) ?? k}${typeof v === "string" && v !== "Bilateral" ? ` (${v.toLowerCase()})` : typeof v === "string" ? " (both)" : ""}`);
  const years = num(front.period_of_suffering_years);
  const months = num(front.period_of_suffering_months);
  const duration =
    [years ? `${years} year${years === 1 ? "" : "s"}` : null, months ? `${months} month${months === 1 ? "" : "s"}` : null].filter(Boolean).join(" ") || null;

  // What the doctor found.
  const dx = latest.get("provisional_diagnosis") ?? {};
  const dxLabels = labels("provisional_diagnosis");
  const conditions = [
    ...Object.entries(dx)
      .filter(([k, v]) => k.startsWith("dx_") && v === true)
      .map(([k]) => (dxLabels.get(k) ?? k).replace(/^\d+\.\s*/, "")),
    ...Object.entries(dx)
      .filter(([k, v]) => k.startsWith("dx_other_") && typeof v === "string" && v.trim())
      .map(([, v]) => String(v).trim()),
  ];

  // How much it hurts.
  const q = latest.get("questionnaire") ?? null;
  const qLabels = labels("questionnaire");
  const regions = q
    ? Object.entries(q)
        .filter(([k, v]) => k.startsWith("ganguly_") && typeof v === "string" && v.trim())
        .map(([k, v]) => ({
          region: (qLabels.get(k) ?? k).replace(/ joint/, ""),
          score: GANGULY_SCORE[String(v).trim().charAt(0)] ?? 0,
          answer: String(v).replace(/^[A-E]\s*—\s*/, ""),
        }))
    : [];
  const w = q ? womacTotals(q) : null;
  const womac = w && w.total.answered > 0
    ? { pain: w.pain.percent, stiffness: w.stiffness.percent, function: w.function.percent, total: w.total.percent }
    : null;

  // What was measured.
  const m = latest.get("measurements") ?? {};
  const a = anthropometrics(m);
  const sys = num(m.bp_systolic);
  const dia = num(m.bp_diastolic);
  const bp = bpTone(sys, dia);
  const vitals: Stat[] = ([
    sys != null && dia != null ? { label: "Blood pressure", value: `${fixed(sys, 0)}/${fixed(dia, 0)}`, unit: "mmHg", note: bp.note, tone: bp.tone } : null,
    num(m.pulse_rate) != null
      ? { label: "Pulse", value: fixed(num(m.pulse_rate), 0), unit: "bpm", tone: range(num(m.pulse_rate), [60, 100], [50, 110]), note: "60–100" }
      : null,
    num(m.spo2) != null ? { label: "SpO₂", value: fixed(num(m.spo2), 0), unit: "%", tone: range(num(m.spo2), [95, 100], [92, 100]), note: "95–100" } : null,
    num(m.blood_glucose) != null
      ? { label: "Blood sugar", value: fixed(num(m.blood_glucose), 0), unit: "mg/dL", tone: range(num(m.blood_glucose), [70, 140], [60, 200]), note: "Random 70–140" }
      : null,
    num(m.body_temperature) != null
      ? { label: "Temperature", value: fixed(num(m.body_temperature)), unit: "°F", tone: range(num(m.body_temperature), [97, 99.5], [96, 100.4]) }
      : null,
  ] as (Stat | null)[]).filter((s): s is Stat => !!s);

  const bmi = bmiTone(a.bmi);
  const female = /^f/i.test(context.patient.gender ?? "");
  const body: Stat[] = ([
    num(m.weight_kg) != null ? { label: "Weight", value: fixed(num(m.weight_kg)), unit: "kg", tone: "neutral" as Tone } : null,
    num(m.height_cm) != null ? { label: "Height", value: fixed(num(m.height_cm), 0), unit: "cm", tone: "neutral" as Tone } : null,
    a.bmi != null ? { label: "BMI", value: fixed(a.bmi), note: bmi.note, tone: bmi.tone } : null,
    a.whpr != null
      ? { label: "Waist ÷ hip", value: a.whpr.toFixed(2), note: female ? "Under 0.85" : "Under 0.90", tone: (a.whpr <= (female ? 0.85 : 0.9) ? "good" : "poor") as Tone }
      : null,
    a.whtr != null ? { label: "Waist ÷ height", value: a.whtr.toFixed(2), note: "Under 0.50", tone: (a.whtr < 0.5 ? "good" : a.whtr < 0.6 ? "fair" : "poor") as Tone } : null,
  ] as (Stat | null)[]).filter((s): s is Stat => !!s);

  // The two sides, wherever both were measured.
  const mLabels = labels("measurements");
  const mUnits = new Map((formByKey("measurements") ? formFields(formByKey("measurements")!) : []).map((f) => [f.key, f.unit ?? ""]));
  const sides: SidePair[] = [];
  for (const key of Object.keys(m)) {
    if (!key.endsWith("_right")) continue;
    const base = key.slice(0, -"_right".length);
    const right = num(m[key]);
    const left = num(m[`${base}_left`]);
    if (right == null || left == null) continue;
    const label = (mLabels.get(key) ?? base).replace(/\s*—\s*right (leg|hand)$/, "");
    const big = Math.max(Math.abs(right), Math.abs(left));
    sides.push({ label, unit: mUnits.get(key) ?? "", right, left, asymmetry: big ? Math.round((Math.abs(right - left) / big) * 100) : 0 });
  }

  // The DynaMo: the latest of each test.
  const catalogue = await listValdTestTypes(db, { includeInactive: true }).catch(() => []);
  const tests = chart
    ? await db.select().from(valdTest).where(eq(valdTest.patientId, chart.id)).orderBy(desc(valdTest.testedAt)).limit(200)
    : [];
  const seen = new Set<string>();
  const vald: PatientSummary["vald"] = [];
  for (const t of tests) {
    const id = `${t.testCategory}|${t.bodyRegion}|${t.movement}|${t.position ?? ""}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const def = catalogue.find((d) => d.region === t.bodyRegion && d.movement === t.movement && (!t.position || d.position === t.position));
    const rom = t.testCategory === "RangeofMotion";
    const left = rom ? t.leftRomDegrees : t.leftMaxForceNewtons != null ? t.leftMaxForceNewtons / 9.80665 : null;
    const right = rom ? t.rightRomDegrees : t.rightMaxForceNewtons != null ? t.rightMaxForceNewtons / 9.80665 : null;
    vald.push({
      label: def?.label ?? `${t.bodyRegion} ${t.movement}`.replace(/([a-z])([A-Z])/g, "$1 $2"),
      region: t.bodyRegion ?? "",
      kind: rom ? "rom" : "force",
      unit: rom ? "°" : "kg",
      left: left != null ? Math.round(left * 10) / 10 : null,
      right: right != null ? Math.round(right * 10) / 10 : null,
      asymmetry: t.asymmetryPercent != null ? Math.round(Math.abs(t.asymmetryPercent)) : null,
      testedAt: day(t.testedAt),
    });
  }

  // Over the visits.
  const trend = visitList
    .map((v) => {
      const qq = v.forms.get("questionnaire");
      const mm = v.forms.get("measurements");
      const ww = qq ? womacTotals(qq) : null;
      const aa = mm ? anthropometrics(mm) : null;
      return {
        date: day(v.at),
        womac: ww && ww.total.answered > 0 ? ww.total.percent : null,
        weight: mm ? num(mm.weight_kg) : null,
        bmi: aa?.bmi ?? null,
      };
    })
    .filter((t) => t.womac != null || t.weight != null);

  // The plan.
  const [current, prescription, diet] = await Promise.all([
    getExerciseHistory(db, contactId),
    getExerciseProtocol(db, contactId),
    getDietProtocol(db, contactId),
  ]);
  let adherence: PatientSummary["exercise"]["adherence"] = null;
  if (prescription?.active && prescription.protocol.dailyCheckIn) {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const entries = (await checkinsBetween(db, contactId, from, to).catch(() => [])).filter((e) => e.kind === "exercise");
    const score = (r: string) => CHECKINS.exercise.options.find((o) => o.value === r)?.score;
    adherence = {
      done: entries.filter((e) => score(e.response) === "done").length,
      partial: entries.filter((e) => score(e.response) === "partial").length,
      missed: entries.filter((e) => score(e.response) === "missed").length,
    };
  }

  const p = prescription?.protocol;
  return {
    patient: { name: context.patient.name, code: context.patient.code, age: context.patient.age, gender: context.patient.gender },
    clinic: context.clinic ? { name: context.clinic.name, brandColor: context.clinic.brandColor, logoUrl: context.clinic.logoUrl } : null,
    lastVisit: last ? { date: day(last.at), doctor: last.doctor } : null,
    visitsCount: visitList.length,
    complaints: {
      complaints: asList(front.chief_complaint),
      locations: asList(front.complaint_location),
      painAreas,
      duration,
      triggers: asList(clinical.pain_factors),
    },
    diagnosis: { conditions, notes: typeof dx.dx_notes === "string" && dx.dx_notes.trim() ? dx.dx_notes.trim() : null },
    pain: { regions, womac },
    vitals,
    body,
    sides: sides.sort((x, y) => y.asymmetry - x.asymmetry),
    vald,
    trend,
    exercise: {
      current,
      plan: p
        ? {
            title: p.title,
            duration: p.duration,
            schedule: p.schedule,
            active: !!prescription?.active,
            exercises: p.exercises.map((e) => ({
              name: e.name,
              dose: [e.sets && e.reps ? `${e.sets} × ${e.reps}` : e.reps || e.sets, e.hold && e.hold !== "—" ? e.hold : null].filter(Boolean).join(" · "),
            })),
            checkInRunning: !!prescription?.active && !!p.dailyCheckIn,
          }
        : null,
      adherence,
    },
    diet: diet
      ? {
          title: diet.protocol.title,
          badge: diet.protocol.badge,
          diet: diet.protocol.diet,
          meals: diet.protocol.meals?.length ?? 0,
          avoid: (diet.protocol.avoid ?? []).slice(0, 8),
        }
      : null,
  };
}


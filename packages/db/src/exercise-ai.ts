import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  aiAssistantConfig,
  clinicalFormSubmission,
  exerciseProtocolTemplate,
  patientRecord,
  planEnrollment,
  valdTest,
} from "./schema";
import type * as schema from "./schema";
import { formByKey, formFields, isFieldVisible } from "./clinical-forms";
import { kneeTemplate, normalizeExerciseProtocol, type ExerciseProtocol } from "./exercise-protocol";
import { describeExerciseHistory, getExerciseHistory } from "./exercise-history";

type Db = NodePgDatabase<typeof schema>;

/**
 * An exercise prescription written for one patient by a language model, from
 * what the clinic has recorded about them — for the doctor to check, change
 * and activate. Never saved or sent from here: it comes back as a draft.
 *
 * What it reads: the registration and clinical history, the pain
 * questionnaires (WOMAC), the measurements (KGB, CAP, SLR, …), the
 * provisional diagnosis, the latest DynaMo strength and range-of-motion
 * results, and the running course — whose length is the prescription's.
 * Names, phone numbers and addresses are left out; the model gets age, sex
 * and the clinical record only.
 *
 * Videos: an exercise the clinic's library already has keeps that checked
 * video. Anything else gets a YouTube search for the exercise — the model is
 * never trusted to name a video address, which it would invent.
 */

/** The forms the prescription is written from, in the order a doctor reads them. */
const FORM_KEYS = ["provisional_diagnosis", "measurements", "questionnaire", "registration_clinical", "registration_front_desk"];

/** Fields that identify the patient rather than describe their condition. */
const IDENTIFYING = /(^|_)(first_name|last_name|name|dob|address|city|state|pin_code|phone|email|referr|referral)/i;

export class ExerciseAiError extends Error {}

function answerText(value: unknown): string {
  if (value === true) return "yes";
  if (value === false || value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(answerText).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

const n = (v: number | null) => (v == null ? "—" : String(Math.round(v * 10) / 10));

/** What the clinic knows about this patient, as plain text, plus the running course. */
export async function exercisePatientContext(db: Db, contactId: string) {
  const [course] = await db
    .select()
    .from(planEnrollment)
    .where(and(eq(planEnrollment.contactId, contactId), eq(planEnrollment.status, "active")))
    .orderBy(desc(planEnrollment.activatedAt))
    .limit(1);
  if (!course) throw new ExerciseAiError("Exercises are auto-prescribed for a patient on an active course — start their course first.");

  const lines: string[] = [];
  const [chart] = await db.select().from(patientRecord).where(eq(patientRecord.contactId, contactId)).limit(1);
  if (chart) {
    const age = chart.dateOfBirth ? Math.floor((Date.now() - Date.parse(chart.dateOfBirth)) / (365.25 * 86_400_000)) : null;
    lines.push(`Patient: ${chart.gender.toLowerCase()}${age && age > 0 && age < 120 ? `, ${age} years` : ""}.`);
  }
  const station = /out[\s-]*station/i.test(course.planName) ? "out station (treated mostly at home)" : "in station (comes to the clinic)";
  lines.push(`Course: ${course.planName} — ${course.durationDays} days, ${course.sittings} sittings, ${station}.`);

  const rows = await db
    .select()
    .from(clinicalFormSubmission)
    .where(and(eq(clinicalFormSubmission.contactId, contactId), inArray(clinicalFormSubmission.formKey, FORM_KEYS)))
    .orderBy(desc(clinicalFormSubmission.updatedAt));

  for (const key of FORM_KEYS) {
    const form = formByKey(key);
    const row = rows.find((r) => r.formKey === key);
    if (!form || !row) continue;
    const answers = (row.answers ?? {}) as Record<string, unknown>;
    const fields = formFields(form);
    const facts = fields
      .filter((f) => !IDENTIFYING.test(f.key) && isFieldVisible(f, answers, fields))
      .map((f) => {
        const text = answerText(answers[f.key]);
        return text ? `- ${f.label.replace(/^\d+\.\s*/, "")}: ${text}${f.unit ? ` ${f.unit}` : ""}${f.normal ? ` (normal ${f.normal})` : ""}` : null;
      })
      .filter(Boolean);
    if (facts.length) lines.push(`\n${form.title}:\n${facts.join("\n")}`);
  }

  if (chart) {
    const tests = await db.select().from(valdTest).where(eq(valdTest.patientId, chart.id)).orderBy(desc(valdTest.testedAt)).limit(60);
    const latest = new Map<string, (typeof tests)[number]>();
    for (const t of tests) {
      const k = [t.testCategory, t.bodyRegion, t.movement, t.position].join("|");
      if (!latest.has(k)) latest.set(k, t);
    }
    const facts = [...latest.values()].map((t) => {
      const what = [t.bodyRegion, t.movement, t.position].filter(Boolean).join(" ");
      const force = t.leftMaxForceNewtons != null || t.rightMaxForceNewtons != null ? ` strength L ${n(t.leftMaxForceNewtons)} N / R ${n(t.rightMaxForceNewtons)} N` : "";
      const rom = t.leftRomDegrees != null || t.rightRomDegrees != null ? ` range L ${n(t.leftRomDegrees)}° / R ${n(t.rightRomDegrees)}°` : "";
      const asym = t.asymmetryPercent != null ? `, asymmetry ${n(t.asymmetryPercent)}%` : "";
      return `- ${what} (${t.testedAt.toISOString().slice(0, 10)}):${force}${rom}${asym}`;
    });
    if (facts.length) lines.push(`\nDynaMo (VALD) results, latest of each test:\n${facts.join("\n")}`);
  }

  // What they already do, so the plan builds on it.
  const doing = describeExerciseHistory(await getExerciseHistory(db, contactId));
  if (doing) lines.push(`\n${doing}`);

  return { text: lines.join("\n"), course };
}

/** name (lower case) → a checked video, from the clinic's library and the built-in template. */
async function knownVideos(db: Db): Promise<Map<string, { name: string; url: string }>> {
  const out = new Map<string, { name: string; url: string }>();
  const add = (p: ExerciseProtocol | null | undefined) => {
    for (const e of p?.exercises ?? []) if (e.videoUrl) out.set(e.name.trim().toLowerCase(), { name: e.name, url: e.videoUrl });
  };
  add(kneeTemplate());
  const rows = await db.select({ protocol: exerciseProtocolTemplate.protocol }).from(exerciseProtocolTemplate).where(eq(exerciseProtocolTemplate.isActive, true));
  for (const r of rows) add(r.protocol as ExerciseProtocol);
  return out;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "goal", "schedule", "warmup", "exercises", "precautions", "instructions", "followUp", "reasoning"],
  properties: {
    title: { type: "string" },
    goal: { type: "string" },
    schedule: { type: "string" },
    warmup: { type: "string" },
    exercises: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "sets", "reps", "hold", "frequency", "notes"],
        properties: {
          name: { type: "string" },
          sets: { type: "string" },
          reps: { type: "string" },
          hold: { type: "string" },
          frequency: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
    precautions: { type: "array", items: { type: "string" } },
    instructions: { type: "array", items: { type: "string" } },
    followUp: { type: "string" },
    reasoning: { type: "string" },
  },
} as const;

const SYSTEM = `You are a senior musculoskeletal physiotherapist at OPTM Health Care, a pain clinic in New Delhi. You write a HOME exercise prescription for one patient, which their doctor will check before it reaches them.

Rules:
- Base every choice on the record you are given: diagnosis, where the pain is, its severity and duration, the measurements (and their normal ranges), questionnaire scores, comorbidities, and the DynaMo strength/range results. Target the weak or stiff side and the specific deficits you see. If the record is thin, write a conservative, general program for the documented complaint.
- Safe for an unsupervised patient at home, often older, with pain: no heavy loads, no deep squats or kneeling for knee arthritis, no end-range spinal flexion for disc problems, nothing a listed condition makes unsafe. Progress gently.
- 5 to 8 exercises. Plain names a patient understands (e.g. "Straight leg raise"). For each: sets, reps, hold, frequency, and one short line on how to do it or what to feel.
- Choose for THIS patient's condition (knee, back, neck, shoulder, …), not from a fixed list. The clinic library below is only a source of names that already have a demonstration video: when one of those is genuinely right, use its name exactly as written; otherwise name the right exercise yourself (for a back or disc problem, say, the spinal exercises it needs).
- "title" names the condition: "Lumbar Disc & Knee Program", not "Home Exercise Prescription".
- Simple English, short sentences. The duration is fixed by the course — do not change it.
- "reasoning": two or three sentences for the doctor on why this program, naming the findings it answers. Not shown to the patient.`;

export interface AiExerciseResult {
  protocol: ExerciseProtocol;
  /** For the doctor: why these exercises. */
  reasoning: string;
  model: string;
}

/**
 * Which service and model write it: the ones chosen in the admin AI settings
 * (the patient assistant's), unless EXERCISE_AI_PROVIDER / EXERCISE_AI_MODEL
 * say otherwise. Both providers take the same OpenAI-style request — Gemini
 * through its OpenAI-compatible endpoint.
 */
export async function aiEndpoint(db: Db) {
  const [config] = await db.select().from(aiAssistantConfig).limit(1);
  const provider = process.env.EXERCISE_AI_PROVIDER || config?.provider || "openai";
  // A prescription is a few calls a day and needs judgement, so not the
  // assistant's lite model: the full flash on Google, the assistant's own on OpenAI.
  const model = process.env.EXERCISE_AI_MODEL || (provider === "google" ? "gemini-3.5-flash" : config?.model || "gpt-4.1");
  if (provider === "google") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new ExerciseAiError("Auto-prescription is not set up — GEMINI_API_KEY is missing on the server.");
    return { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key, model };
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ExerciseAiError("Auto-prescription is not set up — OPENAI_API_KEY is missing on the server.");
  return { url: "https://api.openai.com/v1/chat/completions", key, model };
}

/** Write a prescription for this patient. Throws ExerciseAiError with a readable message. */
export async function generateExerciseProtocol(db: Db, contactId: string): Promise<AiExerciseResult> {
  const { url, key: apiKey, model } = await aiEndpoint(db);

  const { text, course } = await exercisePatientContext(db, contactId);
  const videos = await knownVideos(db);
  const library = [...videos.values()].map((v) => `- ${v.name}`).join("\n");

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Clinic library exercises (use these names when one fits):\n${library || "(none)"}\n\nThe patient's record:\n${text}\n\nWrite the home exercise prescription for the ${course.durationDays}-day course.`,
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "exercise_prescription", strict: true, schema: SCHEMA } },
    }),
    signal: AbortSignal.timeout(90_000),
  }).catch((error) => {
    throw new ExerciseAiError(`Could not reach the AI service — ${error instanceof Error ? error.message : String(error)}`);
  });
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string; refusal?: string } }[]; error?: { message?: string } } | null;
  if (!res.ok) throw new ExerciseAiError(`The AI service refused: ${data?.error?.message ?? res.status}`);
  const message = data?.choices?.[0]?.message;
  if (message?.refusal) throw new ExerciseAiError(`The AI declined: ${message.refusal}`);

  let out: {
    title: string;
    goal: string;
    schedule: string;
    warmup: string;
    exercises: { name: string; sets: string; reps: string; hold: string; frequency: string; notes: string }[];
    precautions: string[];
    instructions: string[];
    followUp: string;
    reasoning: string;
  };
  try {
    out = JSON.parse(message?.content ?? "");
  } catch {
    throw new ExerciseAiError("The AI answer could not be read — try again.");
  }

  const protocol = normalizeExerciseProtocol({
    version: 1,
    source: { templateId: "ai", templateName: "Auto-prescribed (AI)" },
    title: out.title,
    goal: out.goal,
    duration: `${course.durationDays} days`,
    schedule: out.schedule,
    warmup: out.warmup,
    exercises: out.exercises.map((e) => ({
      ...e,
      videoUrl:
        videos.get(e.name.trim().toLowerCase())?.url ??
        `https://www.youtube.com/results?search_query=${encodeURIComponent(`${e.name} exercise physiotherapy`)}`,
    })),
    precautions: out.precautions,
    instructions: out.instructions,
    followUp: out.followUp,
    dailyCheckIn: true,
  });
  return { protocol, reasoning: out.reasoning, model };
}


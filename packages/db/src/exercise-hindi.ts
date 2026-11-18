import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { clinicalFormSubmission } from "./schema";
import type * as schema from "./schema";
import type { ExerciseProtocol } from "./exercise-protocol";
import { EXERCISE_FORM_KEY } from "./exercise-protocol-store";
import { aiEndpoint } from "./exercise-ai";

type Db = NodePgDatabase<typeof schema>;

/**
 * The patient's exercise plan in everyday Hindi, for the Hindi option on the
 * plan page (apps/clinic src/app/e/[token]). Not textbook Hindi: the words
 * people actually say — "exercise", "band", "set" stay as they are, written in
 * Devanagari.
 *
 * Written once by the AI and kept on the prescription with a fingerprint of
 * the English it came from. Saving a changed prescription drops it, and a
 * fingerprint that no longer matches is written again, so the Hindi never
 * describes an older plan.
 */

export interface HindiPlan {
  title: string;
  goal: string;
  duration: string;
  schedule: string;
  warmup: string;
  followUp: string;
  exercises: { name: string; sets: string; reps: string; hold: string; frequency: string; notes: string }[];
  precautions: string[];
  instructions: string[];
}

type WithHindi = ExerciseProtocol & { hindi?: { hash: string; plan: HindiPlan } };

function english(p: ExerciseProtocol): HindiPlan {
  return {
    title: p.title,
    goal: p.goal,
    duration: p.duration,
    schedule: p.schedule,
    warmup: p.warmup,
    followUp: p.followUp,
    exercises: p.exercises.map((e) => ({
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      hold: e.hold,
      frequency: e.frequency,
      notes: e.notes,
    })),
    precautions: p.precautions,
    instructions: p.instructions,
  };
}

const fingerprint = (plan: HindiPlan) => createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 16);

const str = { type: "string" } as const;
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "goal", "duration", "schedule", "warmup", "followUp", "exercises", "precautions", "instructions"],
  properties: {
    title: str,
    goal: str,
    duration: str,
    schedule: str,
    warmup: str,
    followUp: str,
    exercises: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "sets", "reps", "hold", "frequency", "notes"],
        properties: { name: str, sets: str, reps: str, hold: str, frequency: str, notes: str },
      },
    },
    precautions: { type: "array", items: str },
    instructions: { type: "array", items: str },
  },
} as const;

const SYSTEM = `You translate a physiotherapy home-exercise plan for an Indian patient into simple, everyday spoken Hindi, in Devanagari.
- Write the way a friendly physiotherapist in Delhi talks to a patient — not formal or textbook (shuddh) Hindi.
- Keep the English words people normally use, written in Devanagari: exercise, set, rep, band, towel, table, wall, stretch, program, minute, second, ice, warm pack.
- Exercise names: the common English name in Devanagari (e.g. "पेंडुलम एक्सरसाइज़"), not a literal translation.
- Numbers stay as digits; "2", "10", "3×10", "5 sec" stay readable ("5 सेकंड").
- Same number of exercises, precautions and instructions, in the same order. Empty strings and "—" stay as they are.
- Translate only; add nothing and leave nothing out.`;

/** The Hindi plan for this patient's current prescription — written now if needed. Throws on an AI failure. */
export async function hindiExercisePlan(db: Db, contactId: string): Promise<HindiPlan | null> {
  const [row] = await db
    .select({ id: clinicalFormSubmission.id, answers: clinicalFormSubmission.answers })
    .from(clinicalFormSubmission)
    .where(
      and(
        eq(clinicalFormSubmission.contactId, contactId),
        eq(clinicalFormSubmission.formKey, EXERCISE_FORM_KEY),
        isNull(clinicalFormSubmission.appointmentId),
      ),
    )
    .orderBy(desc(clinicalFormSubmission.updatedAt))
    .limit(1);
  if (!row) return null;

  const protocol = row.answers as WithHindi;
  const source = english(protocol);
  const hash = fingerprint(source);
  if (protocol.hindi?.hash === hash) return protocol.hindi.plan;

  const { url, key, model } = await aiEndpoint(db);
  // A busy service (503 / 429) gets one more try a moment later.
  const ask = () => fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(source) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "hindi_exercise_plan", strict: true, schema: SCHEMA } },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  let res = await ask();
  if (res.status === 503 || res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await ask();
  }
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(`Translation failed: ${data?.error?.message ?? res.status}`);
  let plan: HindiPlan | null = null;
  try {
    plan = JSON.parse(data?.choices?.[0]?.message?.content ?? "null") as HindiPlan | null;
  } catch {
    plan = null;
  }
  // Only a translation that lines up with the English is kept.
  if (
    !plan ||
    !Array.isArray(plan.exercises) ||
    plan.exercises.length !== source.exercises.length ||
    !Array.isArray(plan.precautions) ||
    !Array.isArray(plan.instructions)
  ) {
    throw new Error("Translation came back incomplete");
  }

  // Kept beside the plan, not as an edit to it: updatedAt stays the doctor's.
  await db
    .update(clinicalFormSubmission)
    .set({ answers: { ...protocol, hindi: { hash, plan } } })
    .where(eq(clinicalFormSubmission.id, row.id));
  return plan;
}

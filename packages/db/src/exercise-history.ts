import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, isNull } from "drizzle-orm";
import { clinicalFormSubmission } from "./schema";
import type * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

/**
 * What exercise the patient does now — asked before anything is prescribed:
 * walking, gym, yoga, a sport, home exercises from somewhere else. Each with
 * how often, how long, since when and whether it hurts, so the prescription
 * builds on what they already do instead of starting from nothing.
 *
 * One clinical_form_submission per patient with no appointment, like the
 * exercise prescription (./exercise-protocol-store.ts). Saving corrects it.
 */

export const EXERCISE_HISTORY_FORM_KEY = "exercise_history";

export const ACTIVITY_LEVELS = ["Not active", "Lightly active", "Moderately active", "Very active"] as const;
export const INTENSITIES = ["Easy", "Moderate", "Hard"] as const;
export const PAIN_DURING = ["No", "Sometimes", "Yes"] as const;

/** Offered as one-tap rows; anything else is typed. */
export const COMMON_ACTIVITIES = [
  "Walking",
  "Running / jogging",
  "Gym / weights",
  "Yoga",
  "Cycling",
  "Swimming",
  "Sports",
  "Stretching",
  "Home exercises",
  "Physiotherapy exercises",
] as const;

export interface CurrentActivity {
  /** "Walking", "Gym / weights", or whatever they call it. */
  name: string;
  /** "5 days a week" */
  frequency: string;
  /** "30 min", "3 sets of 12" */
  duration: string;
  /** "2 years", "since March" */
  since: string;
  intensity: string;
  /** Does it hurt while doing it — "No", "Sometimes", "Yes". */
  painDuring: string;
  notes: string;
}

export interface ExerciseHistory {
  version: 1;
  activityLevel: string;
  activities: CurrentActivity[];
  /** Exercise they used to do and gave up — and why, often the pain itself. */
  stopped: string;
  notes: string;
  /** Who last filled it — stamped by the server. */
  updated?: { byName: string; at: string };
}

export const emptyActivity = (name = ""): CurrentActivity => ({
  name,
  frequency: "",
  duration: "",
  since: "",
  intensity: "",
  painDuring: "",
  notes: "",
});

export const emptyExerciseHistory = (): ExerciseHistory => ({
  version: 1,
  activityLevel: "",
  activities: [],
  stopped: "",
  notes: "",
});

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneOf = (v: unknown, options: readonly string[]) => (typeof v === "string" && options.includes(v) ? v : "");

/** Whatever came in, as a clean ExerciseHistory. Rows with no name are dropped. */
export function normalizeExerciseHistory(input: unknown): ExerciseHistory {
  const h = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rows = Array.isArray(h.activities) ? h.activities : [];
  return {
    version: 1,
    activityLevel: oneOf(h.activityLevel, ACTIVITY_LEVELS),
    activities: rows
      .map((r) => {
        const a = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
        return {
          name: str(a.name, 120),
          frequency: str(a.frequency, 120),
          duration: str(a.duration, 120),
          since: str(a.since, 120),
          intensity: oneOf(a.intensity, INTENSITIES),
          painDuring: oneOf(a.painDuring, PAIN_DURING),
          notes: str(a.notes, 400),
        };
      })
      .filter((a) => a.name)
      .slice(0, 20),
    stopped: str(h.stopped, 600),
    notes: str(h.notes, 1000),
  };
}

/** Nothing filled in — no level, no activities, no notes. */
export function isEmptyExerciseHistory(h: ExerciseHistory | null | undefined): boolean {
  return !h || (!h.activityLevel && h.activities.length === 0 && !h.stopped && !h.notes);
}

async function existing(db: Db, contactId: string) {
  const [row] = await db
    .select()
    .from(clinicalFormSubmission)
    .where(
      and(
        eq(clinicalFormSubmission.contactId, contactId),
        eq(clinicalFormSubmission.formKey, EXERCISE_HISTORY_FORM_KEY),
        isNull(clinicalFormSubmission.appointmentId),
      ),
    )
    .orderBy(desc(clinicalFormSubmission.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function getExerciseHistory(db: Db, contactId: string): Promise<ExerciseHistory | null> {
  const row = await existing(db, contactId);
  return row ? (row.answers as ExerciseHistory) : null;
}

export async function saveExerciseHistory(
  db: Db,
  contactId: string,
  input: unknown,
  by: { id: string; name: string },
): Promise<ExerciseHistory> {
  const now = new Date();
  const history: ExerciseHistory = { ...normalizeExerciseHistory(input), updated: { byName: by.name, at: now.toISOString() } };
  const before = await existing(db, contactId);
  if (before) {
    await db
      .update(clinicalFormSubmission)
      .set({ answers: history, submittedAt: now, submittedByUserId: by.id, updatedAt: now })
      .where(eq(clinicalFormSubmission.id, before.id));
  } else {
    await db.insert(clinicalFormSubmission).values({
      contactId,
      appointmentId: null,
      formKey: EXERCISE_HISTORY_FORM_KEY,
      formVersion: 1,
      answers: history,
      status: "submitted",
      submittedAt: now,
      submittedByUserId: by.id,
    });
  }
  return history;
}

/** One paragraph for the AI writing a prescription: what they already do. */
export function describeExerciseHistory(h: ExerciseHistory | null): string {
  if (isEmptyExerciseHistory(h)) return "";
  const lines = [
    h!.activityLevel && `Activity level: ${h!.activityLevel}`,
    ...h!.activities.map((a) =>
      [
        `- ${a.name}`,
        a.frequency,
        a.duration,
        a.since && `since ${a.since}`,
        a.intensity && `${a.intensity.toLowerCase()} effort`,
        a.painDuring && `pain while doing it: ${a.painDuring.toLowerCase()}`,
        a.notes,
      ]
        .filter(Boolean)
        .join(", "),
    ),
    h!.stopped && `Stopped: ${h!.stopped}`,
    h!.notes && `Notes: ${h!.notes}`,
  ].filter(Boolean);
  return `Exercise they do now:\n${lines.join("\n")}`;
}

// The shared vocabulary for what a patient has been told to take or do, and
// how adherence to it is scored.
//
// It lives here, not in either app, because both prescribe: doctors and
// nutritionists work in `web`, health coaches in `automation`. The two consoles
// render it differently — that is deliberate — but "what counts as a dose" and
// "what percentage is that" must be one answer, or the same patient will show
// two different adherence numbers depending on who is looking.

export const CarePlanItemType = {
  SUPPLEMENT: "supplement",
  MEDICATION: "medication",
  EXERCISE: "exercise",
  DIET: "diet",
} as const;

export type CarePlanItemType = (typeof CarePlanItemType)[keyof typeof CarePlanItemType];

export const CARE_PLAN_ITEM_TYPES: { value: CarePlanItemType; label: string }[] = [
  { value: "supplement", label: "Supplement" },
  { value: "medication", label: "Medication" },
  { value: "exercise", label: "Exercise" },
  { value: "diet", label: "Diet" },
];

/**
 * Times of day, not clock times.
 *
 * A patient who takes an evening dose at 21:40 instead of 20:00 has adhered;
 * scoring against exact times would mark them non-adherent for being late and
 * would need a tolerance window nobody would ever tune correctly. Three named
 * slots is the coarsest encoding that still answers the question a coach
 * actually asks — "which dose are they skipping?".
 */
export const CarePlanSlot = {
  MORNING: "morning",
  AFTERNOON: "afternoon",
  EVENING: "evening",
} as const;

export type CarePlanSlot = (typeof CarePlanSlot)[keyof typeof CarePlanSlot];

export const CARE_PLAN_SLOTS: { value: CarePlanSlot; label: string; short: string }[] = [
  { value: "morning", label: "Morning", short: "M" },
  // Stored as "afternoon"; shown as "Noon" because that is what the clinic
  // calls it. Changing the stored value would orphan every row already written.
  { value: "afternoon", label: "Noon", short: "N" },
  { value: "evening", label: "Evening", short: "E" },
];

/** Slots in day order, whatever order they were stored in. */
export function orderSlots(slots: unknown): CarePlanSlot[] {
  const given = Array.isArray(slots) ? slots : [];
  return CARE_PLAN_SLOTS.map((s) => s.value).filter((s) => given.includes(s));
}

export const AdherenceStatus = {
  DONE: "done",
  PARTIAL: "partial",
  MISSED: "missed",
} as const;

export type AdherenceStatus = (typeof AdherenceStatus)[keyof typeof AdherenceStatus];

export interface AdherenceDay {
  /** YYYY-MM-DD, the clinic's local day. */
  date: string;
  /** Doses due across every active item that day. */
  expected: number;
  /** Doses reported done. `partial` counts as a half. */
  completed: number;
  /** completed / expected, or null when nothing was due. */
  rate: number | null;
}

/**
 * A day with nothing prescribed scores `null`, never 0%.
 *
 * Zero and "not applicable" look identical on a chart and mean opposite
 * things — a patient with no plan yet would otherwise read as totally
 * non-adherent, which is the reading most likely to prompt a phone call that
 * should never have happened.
 */
export function scoreDay(expected: number, completed: number): AdherenceDay["rate"] {
  if (expected <= 0) return null;
  return Math.min(1, completed / expected);
}

/** `partial` is half credit — they did some of it, which is not nothing. */
export function creditFor(status: string): number {
  if (status === AdherenceStatus.DONE) return 1;
  if (status === AdherenceStatus.PARTIAL) return 0.5;
  return 0;
}

/**
 * Adherence is a fraction, so the calendar encodes it as one hue getting
 * darker — a sequential ramp, which is what magnitude takes.
 *
 * The obvious alternative, a green/amber/red traffic light, is three
 * categorical hues standing in for an ordered quantity, and it fails on its own
 * terms: measured against a white surface, amber-700 and red-600 sit at ΔE 9.9
 * for normal vision and 2.8 under deuteranopia — effectively the same colour
 * for a large minority of readers.
 *
 * "Nothing due" is a neutral, not a step on the ramp: it is the absence of a
 * measurement, not a low one.
 */
export const ADHERENCE_RAMP = {
  none: "#f5f5f4", // nothing prescribed that day
  zero: "#fee2e2", // due, none taken
  low: "#bbf7d0",
  mid: "#4ade80",
  high: "#16a34a",
} as const;

export function rampColor(rate: number | null): string {
  if (rate === null) return ADHERENCE_RAMP.none;
  if (rate <= 0) return ADHERENCE_RAMP.zero;
  if (rate < 0.5) return ADHERENCE_RAMP.low;
  if (rate < 1) return ADHERENCE_RAMP.mid;
  return ADHERENCE_RAMP.high;
}

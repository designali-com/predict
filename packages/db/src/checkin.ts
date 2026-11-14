/**
 * The daily check-ins — medicine, exercise and diet.
 *
 * Each morning, while a patient's plan runs, they are asked on WhatsApp about
 * the day before: one template per kind, the answer a tap on a quick-reply
 * button. Every answer is one row in checkin_log (kind, day, answer), shown on
 * the patient's profile and scored the same way everywhere: done, partly or
 * missed.
 *
 * Pure data and helpers — safe in the browser. The database half is
 * ./checkin-log.ts; the sending and the reply handling live in the automation
 * worker and webhook.
 */

export type CheckinKind = "medicine" | "exercise" | "diet";

/** How an answer counts towards adherence. */
export type CheckinScore = "done" | "partial" | "missed";

export interface CheckinOption {
  /** Stored in checkin_log.response. */
  value: string;
  /** Shown on the profile. */
  label: string;
  /** The WhatsApp button's text — exactly as on the approved template. */
  button: string;
  score: CheckinScore;
}

export interface CheckinDefinition {
  kind: CheckinKind;
  label: string;
  /** The WhatsApp template that asks (communication_template.key). */
  template: string;
  options: CheckinOption[];
}

export const CHECKINS: Record<CheckinKind, CheckinDefinition> = {
  medicine: {
    kind: "medicine",
    label: "Medicine",
    template: "medicine_checkin",
    options: [
      { value: "both", label: "Both taken", button: "Took both", score: "done" },
      { value: "oral", label: "Only oral", button: "Only oral", score: "partial" },
      { value: "topical", label: "Only topical", button: "Only topical", score: "partial" },
      { value: "none", label: "None", button: "Took none", score: "missed" },
    ],
  },
  exercise: {
    kind: "exercise",
    label: "Exercise",
    template: "exercise_checkin",
    options: [
      { value: "done", label: "Done", button: "Yes, did all", score: "done" },
      { value: "partial", label: "Partly", button: "Did some", score: "partial" },
      { value: "missed", label: "Missed", button: "Missed it", score: "missed" },
    ],
  },
  diet: {
    kind: "diet",
    label: "Diet",
    template: "diet_checkin",
    options: [
      { value: "full", label: "Fully", button: "Followed fully", score: "done" },
      { value: "half", label: "Half", button: "Followed half", score: "partial" },
      { value: "none", label: "Not followed", button: "Didn't follow", score: "missed" },
    ],
  },
};

export const CHECKIN_KINDS: CheckinKind[] = ["medicine", "exercise", "diet"];

export const isCheckinKind = (v: unknown): v is CheckinKind => typeof v === "string" && v in CHECKINS;

/** The option a button's words (or a stored value) stand for, within one kind. */
export function checkinOption(kind: CheckinKind, text: string | null | undefined): CheckinOption | null {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return null;
  return CHECKINS[kind].options.find((o) => o.button.toLowerCase() === t || o.value === t) ?? null;
}

/** Which kind a button belongs to, when the message it answers is unknown. */
export function kindsForButton(text: string | null | undefined): CheckinKind[] {
  return CHECKIN_KINDS.filter((k) => checkinOption(k, text));
}

/** A date in India as YYYY-MM-DD — the clinic's day, not the server's (UTC). */
export function istDate(at = new Date(), offsetDays = 0): string {
  const ist = new Date(at.getTime() + 5.5 * 3600_000 + offsetDays * 86_400_000);
  return ist.toISOString().slice(0, 10);
}

/** YYYY-MM-DD plus n days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface CheckinEntry {
  kind: CheckinKind;
  forDate: string;
  response: string;
  source: string;
}

/** The idempotency key of a check-in message — also how a reply finds its day. */
export const checkinKey = (kind: CheckinKind, contactId: string, forDate: string) =>
  `checkin:${kind}:${contactId}:${forDate}`;

export function parseCheckinKey(key: string | null | undefined): { kind: CheckinKind; forDate: string } | null {
  const m = /^checkin:(\w+):[^:]+:(\d{4}-\d{2}-\d{2})$/.exec(key ?? "");
  if (!m || !isCheckinKind(m[1])) return null;
  return { kind: m[1], forDate: m[2]! };
}

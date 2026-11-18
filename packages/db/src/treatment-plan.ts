// What OPTM actually sells, and what a patient owes us attendance against.
//
// A consultation is not a course of treatment. Someone can book one, attend
// it, and never come back — so attending is not the moment they become a
// patient. Buying a sitting plan is: it is the first time there is a schedule
// with their name on it and a number of sessions we are on the hook to
// deliver.
//
// A plan is limbs × days: two limbs (upper and/or lower) or four (neck, back
// and legs), over 6, 21 or 42 days. Those numbers are data, not an enum,
// because the clinic prices and repackages them without shipping code.
//
// The sittings are the part that matters operationally. Each day of a plan is
// one session, and it happens either at the clinic (where it is an
// appointment) or at home with the medicine we sent (where it is a line on a
// log sheet the patient fills in). Both are the same row, because "did day 9
// happen?" is one question, and answering it from two tables that disagree is
// how adherence numbers stop being trusted.

// A plan is a bill, not a price. The clinic's own sheet lists five lines —
// a medicine combo, Phyto Proflex, Morn Blossom sachets, Phyto Crystal, and
// Treatment — each with a rate and a quantity, and the net payable is their
// sum. Storing only the total would lose the quantities, which are the part
// the patient is actually handed: ten sachets on a 6-day course, fifty on a
// 42-day one.
//
// The Treatment line is the sittings. Its quantity is 6, 21 or 42 — the same
// number the log sheet lays out — so it is the one line that is not a thing
// you take home, and the only one whose quantity has to agree with the
// schedule.

export const PlanItemKind = {
  /** Something dispensed: a combo, a sachet, a crystal. */
  MEDICINE: "medicine",
  /** The sittings themselves, priced per sitting. Exactly one per plan. */
  TREATMENT: "treatment",
} as const;

export type PlanItemKind = (typeof PlanItemKind)[keyof typeof PlanItemKind];

export function isPlanItemKind(v: unknown): v is PlanItemKind {
  return v === "medicine" || v === "treatment";
}

export interface PlanItemLike {
  kind: string;
  name: string;
  rateInPaise: number;
  quantity: number;
}

/** One line of the bill: rate × quantity. */
export function lineAmount(item: PlanItemLike): number {
  return item.rateInPaise * item.quantity;
}

export interface PlanTotals {
  /** Sum of the line amounts — the net amount payable. */
  netInPaise: number;
  /** Sum of the unit rates. The clinic's sheet prints this under RATE. */
  rateSumInPaise: number;
  /** Sum of the quantities, printed under QTY. */
  quantity: number;
  /** The Treatment line's quantity, which is how many sittings were bought. */
  sittings: number;
}

/**
 * The three totals along the bottom of the clinic's sheet, computed rather
 * than stored.
 *
 * Stored totals and stored lines disagree the first time somebody edits one
 * and not the other, and the disagreement is invisible until a patient is
 * quoted the wrong number. treatment_plan keeps a cached net for sorting and
 * listing, and it is written from this — never typed in.
 */
export function planTotals(items: PlanItemLike[]): PlanTotals {
  let netInPaise = 0;
  let rateSumInPaise = 0;
  let quantity = 0;
  let sittings = 0;

  for (const item of items) {
    netInPaise += lineAmount(item);
    rateSumInPaise += item.rateInPaise;
    quantity += item.quantity;
    if (item.kind === PlanItemKind.TREATMENT) sittings += item.quantity;
  }

  return { netInPaise, rateSumInPaise, quantity, sittings };
}

export interface EnrollmentBill {
  /** The package lines added up, before any discount. */
  grossInPaise: number;
  discountInPaise: number;
  /** Set when the discount was given as a percentage. */
  discountPercent: number | null;
  /** What the package costs this patient — gross less the discount. The advance is a share of this. */
  packageInPaise: number;
  /** Medicine added on top afterwards, never discounted. */
  extrasInPaise: number;
  /** Everything owed on this course: package plus extras. */
  totalInPaise: number;
}

/**
 * What one course costs, worked out the same way everywhere.
 *
 * It was written out seven times — payments, the billing report, the worklist,
 * the visit, activation, the therapy views — each adding up the lines and none
 * reading the discount, so a discount given at the desk was dropped by every
 * one of them. With lines, the package is the lines less the discount; a course
 * from before plans carried lines has only its stored price, which is already
 * what was charged.
 */
export function enrollmentBill(
  enrollment: { priceInPaise: number; discountInPaise?: number | null; discountPercent?: number | null },
  items: (PlanItemLike & { isExtra: boolean })[],
): EnrollmentBill {
  const discount = Math.max(0, enrollment.discountInPaise ?? 0);
  const lines = items.filter((i) => !i.isExtra);
  const extrasInPaise = planTotals(items.filter((i) => i.isExtra)).netInPaise;
  const grossInPaise = lines.length ? planTotals(lines).netInPaise : enrollment.priceInPaise + discount;
  const packageInPaise = Math.max(0, grossInPaise - discount);
  return {
    grossInPaise,
    discountInPaise: Math.min(discount, grossInPaise),
    discountPercent: enrollment.discountPercent ?? null,
    packageInPaise,
    extrasInPaise,
    totalInPaise: packageInPaise + extrasInPaise,
  };
}

/**
 * A discount as typed — rupees or a percentage of the package — in paise.
 * Throws on anything that would leave the package below nothing.
 */
export function resolveDiscount(
  grossInPaise: number,
  input: { mode: "amount" | "percent"; value: number } | null | undefined,
): { discountInPaise: number; discountPercent: number | null } {
  if (!input || !Number.isFinite(input.value) || input.value <= 0) return { discountInPaise: 0, discountPercent: null };
  if (input.mode === "percent") {
    if (input.value > 100) throw new Error("A discount cannot be more than 100%.");
    return { discountInPaise: Math.round((grossInPaise * input.value) / 100), discountPercent: input.value };
  }
  const paise = Math.round(input.value * 100);
  if (paise > grossInPaise) throw new Error("The discount is more than the package costs.");
  return { discountInPaise: paise, discountPercent: null };
}

export const PlanLimbs = {
  TWO: "two",
  FOUR: "four",
} as const;

export type PlanLimbs = (typeof PlanLimbs)[keyof typeof PlanLimbs];

// Captions are the clinic's own wording from the package sheet — a patient
// asking "does four limbs include my neck?" should be answerable from the
// screen rather than from memory.
export const PLAN_LIMBS: { value: PlanLimbs; label: string; short: string; caption: string }[] = [
  { value: "two", label: "Two limbs", short: "2L", caption: "Upper and/or lower limbs" },
  { value: "four", label: "Four limbs", short: "4L", caption: "Neck, back and legs" },
];

export function limbsLabel(value: string): string {
  return PLAN_LIMBS.find((l) => l.value === value)?.label ?? value;
}

/** The day-counts the clinic sells today. Not a constraint — a starting point. */
export const COMMON_DURATIONS = [6, 21, 42];

export const EnrollmentStatus = {
  /**
   * The doctor has chosen this package; nothing is scheduled and nothing has
   * been paid. Kept apart from active because a prescription the patient
   * declines must not appear as treatment the clinic delivered.
   */
  PRESCRIBED: "prescribed",
  /** Sittings are being delivered. */
  ACTIVE: "active",
  /** Every sitting is behind them, however they went. */
  COMPLETED: "completed",
  /** Stopped part-way — the remaining sittings will not happen. */
  CANCELLED: "cancelled",
} as const;

export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const ENROLLMENT_STATUSES: { value: EnrollmentStatus; label: string }[] = [
  { value: "prescribed", label: "Prescribed" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * Where a sitting happens.
 *
 * Set per sitting, not per plan: a patient on a 42-day course comes in for the
 * first week and does the rest at home, or comes in on the days they can. The
 * clinic decides this one day at a time, so the column has to.
 */
export const SittingMode = {
  IN_CLINIC: "in_clinic",
  AT_HOME: "at_home",
} as const;

export type SittingMode = (typeof SittingMode)[keyof typeof SittingMode];

export const SITTING_MODES: { value: SittingMode; label: string; caption: string }[] = [
  { value: "in_clinic", label: "In clinic", caption: "They come in — this day is an appointment" },
  { value: "at_home", label: "At home", caption: "They do it themselves and log it" },
];

export const SittingStatus = {
  /** Not yet answered — the day may be in the future or simply unrecorded. */
  PENDING: "pending",
  DONE: "done",
  /** The day passed and the therapy did not happen. */
  MISSED: "missed",
} as const;

export type SittingStatus = (typeof SittingStatus)[keyof typeof SittingStatus];

export const SITTING_STATUSES: { value: SittingStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "done", label: "Done" },
  { value: "missed", label: "Missed" },
];

/** Who said so. A patient marking their own log is weaker evidence than staff. */
export const SittingSource = {
  PATIENT: "patient",
  STAFF: "staff",
} as const;

export type SittingSource = (typeof SittingSource)[keyof typeof SittingSource];

export function isPlanLimbs(v: unknown): v is PlanLimbs {
  return v === "two" || v === "four";
}
export function isSittingMode(v: unknown): v is SittingMode {
  return v === "in_clinic" || v === "at_home";
}
export function isSittingStatus(v: unknown): v is SittingStatus {
  return v === "pending" || v === "done" || v === "missed";
}
export function isEnrollmentStatus(v: unknown): v is EnrollmentStatus {
  return v === "prescribed" || v === "active" || v === "completed" || v === "cancelled";
}

/**
 * The planned dates for a course, one per sitting, starting on `startDate`.
 *
 * Consecutive days, because that is what a 6-day plan means and what the
 * patient was told. Every date is only ever a plan: the sitting carries its own
 * date so a day pushed back does not silently renumber the eight after it.
 *
 * Dates are built and returned as YYYY-MM-DD in no timezone at all. Doing this
 * with Date arithmetic puts the clinic's midnight in UTC and hands back the
 * previous day for half the year, which turns "day 1 is Monday" into a support
 * call.
 */
export function buildSittingSchedule(startDate: string, sittings: number): string[] {
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`"${startDate}" is not a YYYY-MM-DD date`);

  const dates: string[] = [];
  for (let i = 0; i < sittings; i++) {
    // UTC arithmetic on a date built from parts: no local offset can shift it,
    // and reading it back with the UTC getters cannot shift it either.
    const at = new Date(Date.UTC(y, m - 1, d + i));
    dates.push(
      `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(
        at.getUTCDate(),
      ).padStart(2, "0")}`,
    );
  }
  return dates;
}

export interface SittingLike {
  status: string;
  mode: string;
  plannedDate: string;
}

export interface PlanProgress {
  total: number;
  done: number;
  missed: number;
  pending: number;
  /** Sittings still to come, by planned date. */
  upcoming: number;
  /** Planned for today or earlier and still unanswered — the follow-up list. */
  overdue: number;
  /** done / (done + missed), or null while nothing has been answered yet. */
  adherence: number | null;
  /** done / total — how much of what they bought has been delivered. */
  completion: number;
}

/**
 * Two different numbers, deliberately.
 *
 * `completion` is how far through the course they are, which is what the
 * patient and the front desk want. `adherence` is how many of the days that
 * have actually come round were done, which is the clinical question — and it
 * divides by answered days only, so a patient on day 2 of 42 is not reported
 * as 5% adherent when they have missed nothing.
 */
export function planProgress(sittings: SittingLike[], today: string, sold?: number): PlanProgress {
  // A sitting is written when the patient comes, so the rows are what has
  // happened, not the course. The course is the number sold; an open-ended
  // (per-session) one has no number, and is as long as what has happened.
  const total = sold != null && sold > 0 ? Math.max(sold, sittings.filter((s) => s.status === SittingStatus.DONE).length) : sittings.length;
  let done = 0;
  let missed = 0;
  let overdue = 0;
  let upcoming = 0;

  for (const s of sittings) {
    if (s.status === SittingStatus.DONE) done++;
    else if (s.status === SittingStatus.MISSED) missed++;
    else if (s.plannedDate <= today) overdue++;
    else upcoming++;
  }

  const answered = done + missed;
  if (sold != null && sold > 0) {
    // Nothing is "overdue" or "missed" any more — a day the patient did not
    // come is simply a day without a sitting. What is left is what is owed.
    const left = Math.max(0, total - done);
    return { total, done, missed: 0, pending: left, upcoming: left, overdue: 0, adherence: null, completion: total > 0 ? done / total : 0 };
  }
  return {
    total,
    done,
    missed,
    pending: total - done - missed,
    upcoming,
    overdue,
    adherence: answered > 0 ? done / answered : null,
    completion: total > 0 ? done / total : 0,
  };
}

/** Indian rupees, whole — plans are not priced in paise. */
export function formatPrice(paise: number | null | undefined): string {
  if (paise == null) return "—";
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * How a course reads on screen — "day 3 of 21", or "session 3".
 *
 * An open-ended course has no total to be a fraction of. Printing "3 of 3"
 * would be true and useless: it says finished, when the patient may well be
 * back on Thursday for a fourth.
 */
export function describeSitting(
  enrollment: { sittings: number; isPerSession?: boolean },
  dayNumber: number,
): string {
  return enrollment.isPerSession
    ? `session ${dayNumber}`
    : `day ${dayNumber} of ${enrollment.sittings}`;
}

/** "Two limbs · 21 days" — the plan in one line, wherever it is named. */
export function describePlan(plan: {
  limbs: string;
  durationDays: number;
  sittings: number;
}): string {
  const base = `${limbsLabel(plan.limbs)} · ${plan.durationDays} days`;
  return plan.sittings === plan.durationDays ? base : `${base} · ${plan.sittings} sittings`;
}

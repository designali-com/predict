// The numbers these forms produce, computed rather than typed.
//
// FORM-II ends in four percentages and FORM-III in three ratios, and every one
// of them is printed on the paper with a formula beside it. Asking a
// physiotherapist to do the arithmetic on a clipboard and then type the answer
// gives two chances to be wrong and no way to tell afterwards which number was
// the mistake — so the inputs are stored and the results are derived on every
// read.

/** The WOMAC / Ganguly answer scale: None 0 … Extreme 4. */
export const WOMAC_OPTIONS = ["None", "Mild", "Moderate", "Severe", "Extreme"];

export function womacScore(answer: unknown): number {
  const index = WOMAC_OPTIONS.indexOf(String(answer));
  // An unanswered item scores zero and is counted as unanswered separately —
  // see womacSubscale, which reports both.
  return index < 0 ? 0 : index;
}

export interface WomacSubscale {
  /** Points earned across the items. */
  score: number;
  /** The maximum the subscale can reach — 4 × item count. */
  max: number;
  /** score / max as a percentage, or null while nothing is answered. */
  percent: number | null;
  answered: number;
  items: number;
}

export function womacSubscale(answers: Record<string, unknown>, keys: string[]): WomacSubscale {
  let score = 0;
  let answered = 0;

  for (const key of keys) {
    const value = answers[key];
    if (value === undefined || value === null || value === "") continue;
    answered++;
    score += womacScore(value);
  }

  const max = keys.length * 4;
  return {
    score,
    max,
    // Null, not zero, while nothing has been filled in. A blank form scoring
    // "0% pain" reads as a healthy patient rather than an empty page.
    percent: answered > 0 ? (score / max) * 100 : null,
    answered,
    items: keys.length,
  };
}

// The three WOMAC subscales, by the field keys used in FORM-II. Ranges match
// the printed form: pain /20, stiffness /8, function /68.
export const WOMAC_PAIN_KEYS = ["womac_p1", "womac_p2", "womac_p3", "womac_p4", "womac_p5"];
export const WOMAC_STIFFNESS_KEYS = ["womac_s1", "womac_s2"];
export const WOMAC_FUNCTION_KEYS = Array.from({ length: 17 }, (_, i) => `womac_a${i + 1}`);

export interface WomacTotals {
  pain: WomacSubscale;
  stiffness: WomacSubscale;
  function: WomacSubscale;
  /** The whole index: all points over all 96, as a percentage. */
  total: WomacSubscale;
}

export function womacTotals(answers: Record<string, unknown>): WomacTotals {
  const pain = womacSubscale(answers, WOMAC_PAIN_KEYS);
  const stiffness = womacSubscale(answers, WOMAC_STIFFNESS_KEYS);
  const fn = womacSubscale(answers, WOMAC_FUNCTION_KEYS);

  const score = pain.score + stiffness.score + fn.score;
  const max = pain.max + stiffness.max + fn.max; // 20 + 8 + 68 = 96
  const answered = pain.answered + stiffness.answered + fn.answered;

  return {
    pain,
    stiffness,
    function: fn,
    total: {
      score,
      max,
      percent: answered > 0 ? (score / max) * 100 : null,
      answered,
      items: pain.items + stiffness.items + fn.items,
    },
  };
}

function num(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface Anthropometrics {
  /** kg / m². Null until both height and weight are in. */
  bmi: number | null;
  /** Waist ÷ hip. */
  whpr: number | null;
  /**
   * Waist ÷ height.
   *
   * The printed form labels this "WHtR (WC/Wt)", but weight is not what it
   * divides by: the normal it quotes is 0.50 for men, and 102 cm ÷ 65 kg is
   * 1.57, while 102 cm ÷ 171 cm is 0.60. 0.50 is the standard waist-to-height
   * cutoff, so the "Wt" on the sheet is a typo for height and the ratio is
   * computed against height here. Worth correcting on the next reprint.
   */
  whtr: number | null;
}

export function anthropometrics(answers: Record<string, unknown>): Anthropometrics {
  const heightCm = num(answers.height_cm);
  const weightKg = num(answers.weight_kg);
  const waistCm = num(answers.waist_cm);
  const hipCm = num(answers.hip_cm);

  const heightM = heightCm && heightCm > 0 ? heightCm / 100 : null;

  return {
    bmi: heightM && weightKg ? weightKg / (heightM * heightM) : null,
    whpr: waistCm && hipCm && hipCm > 0 ? waistCm / hipCm : null,
    whtr: waistCm && heightCm && heightCm > 0 ? waistCm / heightCm : null,
  };
}

/** One decimal for ratios and BMI — the precision the form is read at. */
export function round1(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

export function round2(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

export function percent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

/**
 * Everything derived from a form's answers, keyed by form.
 *
 * One entry point so a screen never has to know which form computes what — it
 * asks for the derived block and renders whatever comes back.
 */
export function derivedFor(formKey: string, answers: Record<string, unknown>) {
  if (formKey === "questionnaire") return { womac: womacTotals(answers) };
  if (formKey === "measurements") return { anthropometrics: anthropometrics(answers) };
  return null;
}

/**
 * Age in completed years, from a date of birth.
 *
 * Arithmetic, so it is filled in rather than asked twice — a form carrying a
 * date of birth and an age that disagree with it cannot be resolved afterwards,
 * and on paper that is exactly what happens.
 *
 * Null for anything unusable: a blank box, a malformed date, a birthday in the
 * future, or an age no person has reached. A wrong number here would be copied
 * onto the chart without anyone recomputing it.
 */
export function ageFromDob(dob: string, on: Date = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;

  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return null;

  // Compared in the clinic's own zone, so somebody born today is 0 rather than
  // -1 for the hours UTC is behind.
  const today = new Date(on.getTime() + 5.5 * 60 * 60 * 1000);
  let age = today.getUTCFullYear() - y;

  const monthNow = today.getUTCMonth() + 1;
  const dayNow = today.getUTCDate();
  // Not had this year's birthday yet.
  if (monthNow < m || (monthNow === m && dayNow < d)) age -= 1;

  if (age < 0 || age > 130) return null;
  return age;
}

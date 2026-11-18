/**
 * Turning one grip measurement into something a person can read.
 *
 * A single number in kilograms means nothing to somebody at a stall. What means
 * something is "where does this sit for a person my age", and "what age is this
 * normal for". Both need a reference curve, so this file holds one.
 *
 * SOURCE AND ITS LIMITS — read before changing any number here.
 *
 * The curve below follows the shape reported by Dodds et al., "Grip strength
 * across the life course: normative data from twelve British studies" (PLoS
 * ONE, 2014), which pooled 49,964 participants and is the most widely used
 * normative reference for handgrip. Peak strength lands in the early thirties
 * and declines steadily after; women's values run roughly 60% of men's.
 *
 * Three things this is NOT:
 *   - It is not a British-population lookup applied silently. Values are a
 *     smoothed reading of that curve, and any result built from it must say on
 *     its face that it is a reference comparison.
 *   - It is not Indian normative data. Published Indian cohorts report somewhat
 *     lower absolute grip at every age. Using a British reference will make an
 *     Indian population look slightly weaker than a local reference would, and
 *     therefore make grip age read slightly older. That is a known bias, stated
 *     here rather than hidden, and it is why this file exists as one editable
 *     table instead of being scattered through the UI.
 *   - It is not a diagnosis. Nothing derived from it should be presented as a
 *     medical finding.
 *
 * The clinic can replace the table with its own measured cohort later; nothing
 * else needs to change.
 */

export type Sex = "male" | "female";

/** Mean peak grip in kilograms, by age, for the stronger hand. */
const MEAN_KG: Record<Sex, [age: number, kg: number][]> = {
  male: [
    [16, 40], [20, 47], [25, 50], [30, 51], [35, 50.5], [40, 49],
    [45, 47.5], [50, 45.5], [55, 43], [60, 40], [65, 37], [70, 33.5],
    [75, 30], [80, 26], [85, 22], [90, 18],
  ],
  female: [
    [16, 25], [20, 29], [25, 30.5], [30, 31], [35, 30.5], [40, 29.5],
    [45, 28.5], [50, 27], [55, 25.5], [60, 24], [65, 22], [70, 20],
    [75, 18], [80, 15.5], [85, 13], [90, 11],
  ],
};

/**
 * Spread around the mean, in kilograms.
 *
 * Roughly constant across the adult range in the pooled data, so kept as one
 * number per sex rather than pretending to a precision the source does not
 * support.
 */
const SD_KG: Record<Sex, number> = { male: 8.5, female: 5.5 };

/** The age the curve peaks at. Nobody is reported as younger than this. */
const PEAK_AGE: Record<Sex, number> = { male: 30, female: 30 };

function interpolate(points: [number, number][], x: number): number {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];

  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

/** What the reference says a person of this age and sex typically grips. */
export function expectedGripKg(age: number, sex: Sex): number {
  return interpolate(MEAN_KG[sex], age);
}

/** Standard normal CDF, for turning a z-score into a percentile. */
function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26, accurate to ~1e-7 — far beyond what a
  // percentile shown to a person needs.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

export interface GripReading {
  /** The stronger hand, which is what the reference curve describes. */
  peakKg: number;
  ageYears: number;
  sex: Sex;
}

export interface GripAssessment {
  peakKg: number;
  /** What the reference expects at their real age. */
  expectedKg: number;
  /** 0-100. Where they sit among people of the same age and sex. */
  percentile: number;
  /**
   * The age at which this grip is the average.
   *
   * Clamped at both ends: the curve is flat before 30 so a very strong grip
   * cannot resolve to a meaningful younger age, and it stops at 90 because the
   * reference does.
   */
  gripAgeYears: number;
  /** Positive means their muscle reads older than they are. */
  deltaYears: number;
}

export function assessGrip({ peakKg, ageYears, sex }: GripReading): GripAssessment {
  const expectedKg = expectedGripKg(ageYears, sex);
  const z = (peakKg - expectedKg) / SD_KG[sex];
  const percentile = Math.min(99, Math.max(1, Math.round(normalCdf(z) * 100)));

  // Grip age: walk the curve for the age whose mean matches this reading. The
  // curve is monotonic after the peak, so a simple scan is exact enough and
  // avoids inverting a piecewise function.
  const peakAge = PEAK_AGE[sex];
  let gripAgeYears = peakAge;

  if (peakKg < expectedGripKg(peakAge, sex)) {
    for (let a = peakAge; a <= 90; a += 0.25) {
      if (expectedGripKg(a, sex) <= peakKg) {
        gripAgeYears = a;
        break;
      }
      gripAgeYears = 90;
    }
  }

  return {
    peakKg,
    expectedKg,
    percentile,
    gripAgeYears: Math.round(gripAgeYears * 10) / 10,
    deltaYears: Math.round((gripAgeYears - ageYears) * 10) / 10,
  };
}

export const NEWTONS_PER_KG = 9.80665;

export function newtonsToKg(newtons: number): number {
  return newtons / NEWTONS_PER_KG;
}

/**
 * The one-line honesty statement that must appear wherever a grip age does.
 *
 * Kept here so it cannot drift away from the numbers it qualifies.
 */
export const GRIP_AGE_DISCLAIMER =
  "Compared against published grip strength reference data (Dodds et al., 2014). This is a fitness comparison, not a medical assessment.";

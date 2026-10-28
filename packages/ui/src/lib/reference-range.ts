export type RangeFlag =
  | "critical-low"
  | "low"
  | "normal"
  | "high"
  | "critical-high"
  | "abnormal"
  | "unflagged"

export type ReferenceRange = {
  /** Lowest normal value, inclusive. */
  low?: number
  /** Highest normal value, inclusive. */
  high?: number
  /** Values below this are flagged critical low. */
  criticalLow?: number
  /** Values above this are flagged critical high. */
  criticalHigh?: number
  /** Shown instead of the generated range, such as "Negative". */
  text?: string
  /** Which way is worse. Defaults to "both". */
  direction?: RangeDirection
}

/**
 * Which side of the range is a concern: "high" when a raised value is bad,
 * "low" when a lowered one is, "both" when the middle of the range is best,
 * and "context" when it depends on the person.
 */
export type RangeDirection = "high" | "low" | "both" | "context"

export const rangeDirectionLabels: Record<RangeDirection, string> = {
  high: "↑ Bad",
  low: "↓ Bad",
  both: "Normal best",
  context: "Context",
}

/**
 * Flags a value against its reference range. Critical limits come first;
 * text and missing ranges are not flagged.
 */
export function flagValue(
  value: number | string,
  range: ReferenceRange = {}
): RangeFlag {
  if (typeof value !== "number" || Number.isNaN(value)) return "unflagged"
  const { low, high, criticalLow, criticalHigh } = range
  if (criticalLow !== undefined && value < criticalLow) return "critical-low"
  if (criticalHigh !== undefined && value > criticalHigh) return "critical-high"
  if (low !== undefined && value < low) return "low"
  if (high !== undefined && value > high) return "high"
  if (low === undefined && high === undefined) return "unflagged"
  return "normal"
}

export const rangeFlagLabels: Record<RangeFlag, string> = {
  "critical-low": "Critical low",
  low: "Low",
  normal: "Normal",
  high: "High",
  "critical-high": "Critical high",
  abnormal: "Abnormal",
  unflagged: "Not flagged",
}

function formatNumber(value: number, decimals?: number) {
  return decimals === undefined ? String(value) : value.toFixed(decimals)
}

/** The range as printed on a report, such as "70–99" or "≤ 200". */
export function formatReferenceRange(
  range: ReferenceRange | undefined,
  decimals?: number
): string | null {
  if (!range) return null
  if (range.text) return range.text
  const { low, high } = range
  if (low !== undefined && high !== undefined)
    return `${formatNumber(low, decimals)}–${formatNumber(high, decimals)}`
  if (high !== undefined) return `≤ ${formatNumber(high, decimals)}`
  if (low !== undefined) return `≥ ${formatNumber(low, decimals)}`
  return null
}

/**
 * The mean and standard deviation implied by a range, treating it as the
 * middle 95% of healthy values: mean (L + U) / 2, SD (U − L) / 4. Null
 * without both limits.
 */
export function rangeStats(range: ReferenceRange | undefined) {
  if (range?.low === undefined || range.high === undefined) return null
  const { low, high } = range
  if (high <= low) return null
  return { mean: (low + high) / 2, sd: (high - low) / 4 }
}

/** How many standard deviations a value sits from the range's mean. */
export function zScore(
  value: number | string,
  range: ReferenceRange | undefined
): number | null {
  const stats = rangeStats(range)
  if (!stats || typeof value !== "number" || Number.isNaN(value)) return null
  return (value - stats.mean) / stats.sd
}

/**
 * Whether a flag is on the side the range's direction marks as bad. A low
 * CRP is flagged low but is not a concern; a low HDL is.
 */
export function isConcern(flag: RangeFlag, direction: RangeDirection = "both") {
  if (flag === "normal" || flag === "unflagged") return false
  if (flag === "abnormal" || direction === "both" || direction === "context")
    return true
  return direction === "high"
    ? flag === "high" || flag === "critical-high"
    : flag === "low" || flag === "critical-low"
}

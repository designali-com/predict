/**
 * The risk bands a composite biomarker index is read against.
 *
 * Ordered, contiguous, and open at the top: the last band has no max, because
 * a score can always be worse than the worst threshold anyone thought to set.
 * The order in the array is the order of the bands — nothing is inferred from
 * the labels, so a clinic that only wants Normal / Severe gets exactly that.
 */
export const RISK_LABELS = ["Normal", "Mild", "Moderate", "Severe", "Extreme"] as const;

export type RiskLabel = (typeof RISK_LABELS)[number];

export interface RiskBand {
  label: RiskLabel;
  min: number;
  /** null on the last band only: "greater than min". */
  max: number | null;
}

export function isRiskLabel(value: unknown): value is RiskLabel {
  return typeof value === "string" && (RISK_LABELS as readonly string[]).includes(value);
}

/**
 * Whether a list of bands can actually classify a score.
 *
 * The rules are what make the bands readable as a single number line rather
 * than a pile of ranges: each starts where the last ended, they climb, no
 * label repeats, and exactly one — the last — is open-ended. A gap or an
 * overlap would leave some scores with no band or with two.
 */
export function validateRiskBands(bands: RiskBand[]): string | null {
  if (bands.length === 0) return null; // Not configured is allowed.

  const seen = new Set<string>();

  for (const [i, band] of bands.entries()) {
    const last = i === bands.length - 1;

    if (!isRiskLabel(band.label)) return `"${band.label}" is not a risk level.`;
    if (seen.has(band.label)) return `${band.label} is listed twice.`;
    seen.add(band.label);

    if (!Number.isFinite(band.min)) return `${band.label} needs a minimum.`;

    if (last) {
      if (band.max != null) return `The last band (${band.label}) is everything above its minimum, so it has no maximum.`;
    } else {
      if (band.max == null) return `${band.label} needs a maximum — only the last band is open-ended.`;
      if (band.max <= band.min) return `${band.label}'s maximum must be greater than its minimum.`;
      if (bands[i + 1]!.min !== band.max) {
        return `${bands[i + 1]!.label} must start at ${band.max}, where ${band.label} ends.`;
      }
    }
  }

  return null;
}

/** Parse whatever came out of jsonb into bands, dropping anything malformed. */
export function parseRiskBands(value: unknown): RiskBand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = entry as { label?: unknown; min?: unknown; max?: unknown };
    if (!isRiskLabel(row.label) || typeof row.min !== "number") return [];
    return [{ label: row.label, min: row.min, max: typeof row.max === "number" ? row.max : null }];
  });
}

/** The band a score falls into, or null when nothing is configured. */
export function bandForScore(bands: RiskBand[], score: number): RiskBand | null {
  return bands.find((b) => score >= b.min && (b.max == null || score < b.max)) ?? null;
}

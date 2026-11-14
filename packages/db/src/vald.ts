/**
 * DynaMo test data, as kept on the patient's record.
 *
 * Tests are run in the clinic over Bluetooth and stored in our own database.
 * VALD's cloud is no longer used: the tests that lived there were imported
 * once, on 2026-10-15, matched to our patients by name and date of birth, and
 * VALD's untouched payload for each is kept in `vald_test.raw`. What is left
 * here reads those payloads.
 */

/**
 * What a DynaMo test actually reports, confirmed against 152 real summaries.
 *
 * The API also declares a long tail of net-force and windowed-RFD fields
 * (netPeakForce, forceAt100ms, rfdAt150ms and so on). Every one of them came
 * back null on every test, so they are deliberately not modelled here — VALD
 * does not compute them for this device.
 */
export interface ValdRepSummary {
  movement: string;
  laterality: string;
  repCount: number;
  maxForceNewtons: number | null;
  avgForceNewtons: number | null;
  maxImpulseNewtonSeconds: number | null;
  maxRangeOfMotionDegrees: number | null;
  maxRateOfForceDevelopmentNewtonsPerSecond: number | null;
  avgTimeToPeakForceSeconds: number | null;
  minTimeToPeakForceSeconds: number | null;
}

/** The per-side metrics kept on each cached test. */
export interface ValdSideMetrics {
  peakForceNewtons: number | null;
  avgForceNewtons: number | null;
  peakRfdNewtonsPerSecond: number | null;
  timeToPeakForceSeconds: number | null;
  impulseNewtonSeconds: number | null;
  rangeOfMotionDegrees: number | null;
  repCount: number | null;
}

/** Pull one side's numbers out of VALD's summary list. */
export function sideMetrics(
  summaries: ValdRepSummary[] | null | undefined,
  side: "LeftSide" | "RightSide",
): ValdSideMetrics | null {
  const list = summaries ?? [];
  const found =
    list.find((s) => s.laterality === side) ??
    // A bilateral or single-sided test carries one unlabelled summary. It is
    // reported on the right rather than dropped, which would show a test with
    // no numbers at all.
    (list.length === 1 && !list.some((s) => s.laterality === "LeftSide" || s.laterality === "RightSide")
      ? side === "RightSide"
        ? list[0]
        : undefined
      : undefined);

  if (!found) return null;
  return {
    peakForceNewtons: found.maxForceNewtons ?? null,
    avgForceNewtons: found.avgForceNewtons ?? null,
    peakRfdNewtonsPerSecond: found.maxRateOfForceDevelopmentNewtonsPerSecond ?? null,
    // The fastest rep, which is what "time to peak force" means on a report.
    timeToPeakForceSeconds: found.minTimeToPeakForceSeconds ?? found.avgTimeToPeakForceSeconds ?? null,
    impulseNewtonSeconds: found.maxImpulseNewtonSeconds ?? null,
    rangeOfMotionDegrees: found.maxRangeOfMotionDegrees ?? null,
    repCount: found.repCount ?? null,
  };
}

/**
 * The per-side metrics for a cached row, wherever they happen to live.
 *
 * Rows written before the metrics were extracted have a null `sides`, but they
 * still carry VALD's untouched payload in `raw` — rate of force development,
 * time to peak force and impulse included. Reading that is why no re-sync is
 * needed to show them.
 */
export function sidesForRow(row: {
  sides: unknown;
  raw: unknown;
  leftMaxForceNewtons: number | null;
  rightMaxForceNewtons: number | null;
  leftRomDegrees: number | null;
  rightRomDegrees: number | null;
}): { left: ValdSideMetrics | null; right: ValdSideMetrics | null } | null {
  if (row.sides) {
    return row.sides as { left: ValdSideMetrics | null; right: ValdSideMetrics | null };
  }

  const summaries = (row.raw as { repetitionTypeSummaries?: ValdRepSummary[] } | null)
    ?.repetitionTypeSummaries;
  if (summaries?.length) {
    const left = sideMetrics(summaries, "LeftSide");
    const right = sideMetrics(summaries, "RightSide");
    if (left || right) return { left, right };
  }

  // Last resort: the two columns the very first version stored.
  const side = (force: number | null, rom: number | null): ValdSideMetrics | null =>
    force == null && rom == null
      ? null
      : {
          peakForceNewtons: force,
          avgForceNewtons: null,
          peakRfdNewtonsPerSecond: null,
          timeToPeakForceSeconds: null,
          impulseNewtonSeconds: null,
          rangeOfMotionDegrees: rom,
          repCount: null,
        };

  const left = side(row.leftMaxForceNewtons, row.leftRomDegrees);
  const right = side(row.rightMaxForceNewtons, row.rightRomDegrees);
  return left || right ? { left, right } : null;
}

/** VALD's payload for one test, as kept in `vald_test.raw` for imported tests. */
export interface ValdTest {
  id: string;
  athleteId: string;
  testCategory: string;
  bodyRegion: string;
  movement: string;
  position: string | null;
  laterality: string | null;
  startTimeUTC: string;
  durationSeconds: number | null;
  repetitionTypeSummaries: ValdRepSummary[] | null;
  asymmetries: { movement: string; valuePercentage: number }[] | null;
}

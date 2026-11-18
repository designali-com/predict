/**
 * One side of one DynaMo test, start to finish.
 *
 * The device layer streams raw force or orientation; the analysis layers turn
 * that into a rep (./analysis.ts) or an angle (./rom.ts). This is the piece
 * the clinic's runner calls: measure the left, measure the right, done.
 */
import { RepDetector, evaluateRep, type Rep } from "./analysis";
import { G } from "./protocol";
import type { DynaMo } from "./device";
import { RomTracker, type RomResult } from "./rom";

export type Side = "left" | "right";

export interface ForceSideResult {
  side: Side;
  /** Best rep. Null if nothing crossed the threshold. */
  best: Rep | null;
  reps: Rep[];
  /** [seconds, newtons], from the start of the measurement. */
  trace: [number, number][];
}

export interface RomSideResult {
  side: Side;
  /** Null if the limb never moved past the start threshold. */
  result: RomResult | null;
  /** [seconds, degrees], the live angle from the steady pose. */
  trace: [number, number][];
}

export interface Stop {
  requested: boolean;
}

export const newtonsToKilograms = (n: number) => n / G;

/** About 5 kg. Below this a rep is a touch on the pad, not an effort to count. */
export const MIN_EFFORT_NEWTONS = 50;

/**
 * Force on one side: any strength test, not only grip. The app runs every
 * region through the same detector — 30 N threshold, same windows — so the
 * only thing that changes is what the device screen says and the minimum rep
 * length, which follows the device family (0.25 s on Grip / Max, none on the
 * older DynaMo and Lite).
 *
 * It does NOT end at the first rep. It used to, and a light touch on the pad —
 * the patient settling their arm — counted as the test and closed it. Now it
 * runs until the operator finishes it, or until the reps asked for are done,
 * and the strongest rep is the result.
 */
export async function measureForceSide(
  device: DynaMo,
  side: Side,
  freqHz: number,
  title: string,
  stop: Stop,
  options: {
    onLive?: (seconds: number, newtons: number) => void
    /** Told after each rep is counted. */
    onRep?: (rep: Rep, count: number, best: Rep) => void
    /** End by itself after this many reps; null runs until the operator finishes. */
    targetReps?: number | null
    /** A safety stop for a test left running, not a pace. */
    timeoutSeconds?: number
  } = {},
): Promise<ForceSideResult> {
  const { onLive, onRep, targetReps = null, timeoutSeconds = 180 } = options;
  const times: number[] = [];
  const forces: number[] = [];
  const reps: Rep[] = [];
  const detector = new RepDetector(freqHz, 30);
  const minDuration = device.isGripOrMax ? 0.25 : 0;

  let openStart: number | null = null;
  let previousEnd = 0;
  let finished = false;

  detector.onSmoothed = (t, f) => onLive?.(t, f);
  detector.onRepStarted = (_t, index) => {
    openStart = index;
  };
  detector.onRepEnded = (_t, index) => {
    if (openStart == null) return;
    const rep = evaluateRep(times, forces, openStart, index, previousEnd, freqHz, minDuration);
    openStart = null;
    if (!rep) return;
    previousEnd = index;
    reps.push(rep);
    const best = reps.reduce((a, r) => (Math.abs(r.peakNewtons) > Math.abs(a.peakNewtons) ? r : a), reps[0]!);
    // Settling a limb on the pad crosses the 30 N detector without being an
    // effort. It is kept, but only real efforts count towards the reps asked for.
    const efforts = reps.filter((r) => Math.abs(r.peakNewtons) >= MIN_EFFORT_NEWTONS).length;
    onRep?.(rep, efforts, best);
    if (targetReps != null && efforts >= targetReps) finished = true;
  };

  const startedAt = Date.now();
  try {
    await device.setTest(title.slice(0, 20), side === "left" ? "Left" : "Right");
  } catch {
    // Only the device's own screen. Not worth failing a test over.
  }
  await device.measure(
    freqHz,
    (t, f) => {
      times.push(t);
      forces.push(f);
      detector.add(t, f);
    },
    () => finished || stop.requested || (Date.now() - startedAt) / 1000 > timeoutSeconds,
  );

  // Finished while still pushing: the rep in progress is the effort they were
  // making, and it counts — up to the last sample.
  if (openStart != null && forces.length - 1 > openStart) {
    const last = evaluateRep(times, forces, openStart, forces.length - 1, previousEnd, freqHz, minDuration);
    if (last) reps.push(last);
  }

  const best = reps.length
    ? reps.reduce((a, r) => (Math.abs(r.peakNewtons) > Math.abs(a.peakNewtons) ? r : a), reps[0]!)
    : null;
  return { side, best, reps, trace: thin(times, forces, 400) };
}

/**
 * Range of motion on one side, the way the DynaMo app runs it:
 *
 *  1. Stabilising — hold the limb still while the gyro settles. The screen is
 *     amber and fills up; it needs 1.5 s without movement.
 *  2. Ready (green) — "perform the movement". Nothing is measured until the
 *     limb has turned 10° from where it was held.
 *  3. Moving — through the range.
 *  4. Held at the end for a second, it is done. Or the operator finishes it.
 */
export async function measureRomSide(
  device: DynaMo,
  side: Side,
  offsetDegrees: number,
  stop: Stop,
  options: {
    /** `stable` is 0–1 while stabilising: how much of the hold has been made. */
    /** `peak` is the furthest from the stable start so far — what will be recorded. */
    onLive?: (degrees: number, phase: RomTracker["phase"], stable: number, peak: number) => void
    timeoutSeconds?: number
  } = {},
): Promise<RomSideResult> {
  const { onLive, timeoutSeconds = 120 } = options;
  const tracker = new RomTracker();
  const times: number[] = [];
  const angles: number[] = [];
  const startedAt = Date.now();

  await device.measureOrientation(
    (t, q) => {
      const live = tracker.add(t, q);
      times.push(t);
      angles.push(live);
      onLive?.(live, tracker.phase, tracker.stableProgress, tracker.peakDegrees);
    },
    () => tracker.phase === "done" || stop.requested || (Date.now() - startedAt) / 1000 > timeoutSeconds,
  );

  const result = tracker.finish(offsetDegrees);
  return { side, result, trace: thin(times, angles, 400) };
}

/** At most `target` points, keeping the largest in each bucket so the peak survives. */
function thin(times: number[], values: number[], target: number): [number, number][] {
  const out: [number, number][] = [];
  if (!times.length) return out;
  const bucket = Math.max(1, Math.ceil(times.length / target));
  const base = times[0]!;
  for (let i = 0; i < times.length; i += bucket) {
    let best = i;
    for (let j = i; j < Math.min(i + bucket, times.length); j++) {
      if (Math.abs(values[j]!) > Math.abs(values[best]!)) best = j;
    }
    out.push([round(times[best]! - base, 3), round(values[best]!, 1)]);
  }
  return out;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

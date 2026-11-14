/**
 * Turning a force stream into reps.
 *
 * These are ports of `Dynamo.Analysis.ForceRepDetector` and
 * `ForceRepEvaluator` from the decompiled app, kept deliberately faithful so a
 * number shown at a stall is the number the official app would have shown.
 *
 * Read that as a limit, not a guarantee: this follows the algorithm as it was
 * decompiled from version 1.10.2, and nothing here has been checked against a
 * VALD-reported figure for the same squeeze. Treat any exact agreement as
 * unverified until somebody measures both.
 */

export interface Sample {
  timeSeconds: number;
  forceNewtons: number;
}

export interface Rep {
  startSeconds: number;
  endSeconds: number;
  /** Largest force in the rep, newtons. */
  peakNewtons: number;
  /** Seconds from the start of the rep to that peak. */
  timeToPeakSeconds: number;
  averageNewtons: number;
  /** Maximum rate of force development, newtons per second. */
  maxRfd: number;
}

/**
 * Live rep detection.
 *
 * Two windows, both scaled off the sampling rate the same way the app scales
 * them: a longer one that smooths the number on screen, and a shorter one that
 * decides whether a squeeze has begun. A rep starts when the short window's
 * mean rises more than `thresholdNewtons` above baseline, and ends when it
 * falls back under the threshold.
 */
export class RepDetector {
  private readonly filterCount: number;
  private readonly analysisCount: number;
  private forceWindow: number[] = [];
  private analysisWindow: Sample[] = [];
  private active = false;
  private index = 0;

  baseline = 0;
  onSmoothed?: (timeSeconds: number, smoothedNewtons: number) => void;
  onRepStarted?: (timeSeconds: number, sampleIndex: number) => void;
  onRepEnded?: (timeSeconds: number, sampleIndex: number) => void;

  constructor(
    readonly sampleRateHz: number,
    readonly thresholdNewtons: number,
  ) {
    this.filterCount = Math.floor(0.15 * (sampleRateHz / 225) * sampleRateHz);
    this.analysisCount = Math.floor(0.05 * (sampleRateHz / 225) * sampleRateHz);
  }

  reset(): void {
    this.forceWindow = [];
    this.analysisWindow = [];
    this.active = false;
  }

  add(timeSeconds: number, forceNewtons: number): void {
    this.analysisWindow.push({ timeSeconds, forceNewtons });
    if (this.analysisWindow.length > this.analysisCount) {
      this.analysisWindow.splice(0, this.analysisWindow.length - this.analysisCount);
    }
    this.forceWindow.push(forceNewtons);
    if (this.forceWindow.length > this.filterCount) {
      this.forceWindow.splice(0, this.forceWindow.length - this.filterCount);
    }

    if (this.forceWindow.length >= this.filterCount && this.onSmoothed) {
      const mean = this.forceWindow.reduce((a, b) => a + b, 0) / this.forceWindow.length;
      this.onSmoothed(timeSeconds, mean);
    }

    if (this.analysisWindow.length >= this.analysisCount) {
      const mean = Math.abs(
        this.analysisWindow.reduce((a, s) => a + s.forceNewtons, 0) / this.analysisWindow.length,
      );
      if (!this.active) {
        if (mean - Math.abs(this.baseline) > this.thresholdNewtons) {
          this.active = true;
          this.onRepStarted?.(this.analysisWindow.at(-1)!.timeSeconds, this.index);
        }
      } else if (mean < this.thresholdNewtons) {
        this.active = false;
        // The rep ended where the analysis window opened, not where it closed:
        // by the time the mean falls, the hand has already been letting go for
        // a window's width.
        this.onRepEnded?.(
          this.analysisWindow[0]!.timeSeconds,
          this.index - this.analysisWindow.length,
        );
        this.reset();
      }
    }
    this.index++;
  }
}

/**
 * Zero-phase 2nd-order Butterworth low-pass.
 *
 * Run forwards then backwards, which is why the cut-off can sit as low as 5 Hz
 * without shifting the peak in time. A one-directional filter would move the
 * peak later and make time-to-peak wrong.
 */
export function butterworth(x: number[], sampleRateHz: number, cutoffHz: number): Float64Array {
  if (x.length < 10) return new Float64Array(0);
  const n = x.length - 1;
  const padded = new Float64Array(n + 4);
  for (let i = 0; i < n; i++) padded[2 + i] = x[i]!;
  padded[0] = padded[1] = x[0]!;
  padded[n + 2] = padded[n + 3] = x[n]!;

  const wc = Math.tan((cutoffHz * Math.PI) / sampleRateHz);
  const k1 = 1.414213562 * wc;
  const k2 = wc * wc;
  const a0 = k2 / (1 + k1 + k2);
  const a1 = 2 * a0;
  const a2 = a0;
  const k3 = a1 / k2;
  const b1 = -2 * a0 + k3;
  const b2 = 1 - 2 * a0 - k3;

  const forward = new Float64Array(n + 4);
  forward[0] = forward[1] = x[0]!;
  for (let j = 2; j < n + 2; j++) {
    forward[j] =
      a0 * padded[j]! +
      a1 * padded[j - 1]! +
      a2 * padded[j - 2]! +
      b1 * forward[j - 1]! +
      b2 * forward[j - 2]!;
  }
  forward[n + 2] = forward[n + 3] = forward[n + 1]!;

  const back = new Float64Array(n + 2);
  back[n] = forward[n + 2]!;
  back[n + 1] = forward[n + 3]!;
  for (let j = n - 1; j >= 0; j--) {
    back[j] =
      a0 * forward[j + 2]! +
      a1 * forward[j + 3]! +
      a2 * forward[j + 4]! +
      b1 * back[j + 1]! +
      b2 * back[j + 2]!;
  }
  return back;
}

/**
 * Measure one detected rep.
 *
 * The detector's boundaries are deliberately late at the start and early at the
 * end, because a threshold cannot fire until force has already risen. So this
 * walks outwards from them on the filtered signal before measuring anything:
 * back to where the hand actually began to pull, forward to where it has truly
 * let go. A rep shorter than `minDurationSeconds` is a twitch, not a squeeze,
 * and returns null.
 */
export function evaluateRep(
  times: number[],
  forces: number[],
  startIndex: number,
  endIndex: number,
  previousEndIndex: number,
  sampleRateHz: number,
  minDurationSeconds = 0.25,
): Rep | null {
  if (endIndex <= startIndex || endIndex >= forces.length) return null;
  const filtered = butterworth(forces, sampleRateHz, 5);
  if (!filtered.length) return null;

  // Yank: the rate of change of force. Used to find the moment the pull began,
  // rather than the moment it crossed a threshold.
  const yank = new Float64Array(forces.length);
  for (let i = 1; i < filtered.length - 2; i++) {
    yank[i] = Math.abs(filtered[i + 1]! - filtered[i - 1]!) / (2 / sampleRateHz);
  }

  let s = startIndex;
  let found = -1;
  while (s > 0) {
    if (Math.abs(filtered[s]!) < 20 && yank[s]! <= 20 && yank[s - 1]! > yank[s]!) {
      found = s;
      break;
    }
    s--;
  }
  // Never walk back into the previous rep.
  s = found >= previousEndIndex && found >= 0 ? found : startIndex;

  let e = endIndex;
  while (e < filtered.length && Math.abs(filtered[e]!) >= 10) e++;
  if (e >= forces.length) e = forces.length - 1;

  if (times[e]! - times[s]! < minDurationSeconds) return null;

  let peakIndex = s;
  for (let i = s; i <= e; i++) {
    if (Math.abs(forces[i]!) > Math.abs(forces[peakIndex]!)) peakIndex = i;
  }

  let sum = 0;
  for (let i = s; i <= e; i++) sum += forces[i]!;

  // Max RFD over a 0.1 s moving average, measured only on the way up.
  const half = Math.floor(Math.floor(0.1 * sampleRateHz) / 2);
  const lo = Math.max(half, s);
  const hi = Math.min(peakIndex, forces.length - half - 1);
  let maxRfd = 0;
  if (hi > lo) {
    const avg = (a: number, b: number) => {
      let t = 0;
      for (let i = a; i <= b; i++) t += forces[i]!;
      return t / (b - a + 1);
    };
    let prev = avg(lo - half, lo + half);
    for (let i = lo + 1; i < hi; i++) {
      const cur = avg(i - half, i + half);
      const rate = (cur - prev) / (times[i]! - times[i - 1]!);
      if (Math.abs(rate) > Math.abs(maxRfd)) maxRfd = rate;
      prev = cur;
    }
  }

  return {
    startSeconds: times[s]!,
    endSeconds: times[e]!,
    peakNewtons: forces[peakIndex]!,
    timeToPeakSeconds: times[peakIndex]! - times[s]!,
    averageNewtons: sum / (e - s + 1),
    maxRfd,
  };
}

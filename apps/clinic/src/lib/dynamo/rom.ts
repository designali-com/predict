/**
 * Range of motion from the DynaMo's orientation stream.
 *
 * Follows what the DynaMo app does (Dynamo.Analysis MovementDetector and
 * Vald.ForceDevice.Extras IMUAnalysis, decompiled from 1.10.2):
 *
 *   1. wait for the limb to be held still — angular speed under 15°/s for 1.5 s;
 *   2. wait for it to move more than 10° from that pose;
 *   3. end once it is still again for 0.5 s (or the operator stops it);
 *   4. find the axis the limb turned about from the spread of its angular
 *      velocity, and report the angle turned about that axis, max − min, plus
 *      the test's offset (−90° for knee extension).
 *
 * Two deliberate departures, both in step 4: the angle about the axis is taken
 * by swing–twist decomposition rather than by the app's Euler-angle route,
 * which needs MathNet's exact conventions to reproduce; and the axis comes from
 * the uncentred second moment of the velocity, which still finds the axis of a
 * smooth, even-paced movement (the app's mean-centred covariance does not).
 * Both measure the same thing — rotation about the movement axis — but nothing
 * here has been checked against a VALD figure for the same movement yet.
 *
 * What goes on the record, though, is neither: it is the furthest the limb got
 * from its stable start — the peak of the angle shown live on screen. The axis
 * figure ran well short of it in practice (68° on screen, 33° saved: a shin
 * that also twists or swings sideways spreads the movement over more than one
 * axis), and with the −90° offset knee and elbow extension came out as small
 * negative numbers that read as the angle on the way back. The axis figure
 * and the VALD-style figure (peak + offset) are kept alongside, for reference.
 */

type Quat = [number, number, number, number]; // w, x, y, z

const RAD = 180 / Math.PI;
const STEADY_DEG_S = 15;
const START_DEG = 10;
const STEADY_HOLD_S = 1.5;
// Longer than the app's 0.5 s: a patient who pauses for half a second partway
// through the range must not have the test end there.
const END_HOLD_S = 1.0;
const SMOOTH_S = 0.15;

const conj = ([w, x, y, z]: Quat): Quat => [w, -x, -y, -z];

function mul(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

/** Rotation angle of a unit quaternion, radians, 0..π. */
const angleOf = (q: Quat) => 2 * Math.acos(Math.min(1, Math.abs(q[0])));

/** Rotation vector (axis × angle) of a unit quaternion. */
function logOf(q: Quat): [number, number, number] {
  const s = q[0] < 0 ? -1 : 1;
  const [w, x, y, z] = [q[0] * s, q[1] * s, q[2] * s, q[3] * s];
  const n = Math.hypot(x, y, z);
  if (n < 1e-9) return [0, 0, 0];
  const k = (2 * Math.atan2(n, w)) / n;
  return [x * k, y * k, z * k];
}

/** Dominant eigenvector of a symmetric positive semi-definite 3×3. */
function principalAxis(m: number[][]): [number, number, number] {
  let v: [number, number, number] = [1, 0.7, 0.4];
  for (let i = 0; i < 100; i++) {
    const n: [number, number, number] = [
      m[0]![0]! * v[0] + m[0]![1]! * v[1] + m[0]![2]! * v[2],
      m[1]![0]! * v[0] + m[1]![1]! * v[1] + m[1]![2]! * v[2],
      m[2]![0]! * v[0] + m[2]![1]! * v[1] + m[2]![2]! * v[2],
    ];
    const len = Math.hypot(...n);
    if (len < 1e-12) break;
    v = [n[0] / len, n[1] / len, n[2] / len];
  }
  return v;
}

export interface RomResult {
  /** What goes on the record: the furthest the limb got from its stable start. */
  romDegrees: number;
  /** The same peak — kept under its old name for older readers of the record. */
  excursionDegrees: number;
  /** Rotation about the estimated movement axis, max − min. Reference only. */
  axisDegrees: number;
  /** VALD's convention: the peak plus the test's offset (−90° for knee extension). */
  valdStyleDegrees: number;
  durationSeconds: number;
}

export class RomTracker {
  phase: "steady" | "move" | "moving" | "done" = "steady";

  private t: number[] = [];
  private q: Quat[] = [];
  private speeds: number[] = [];
  private stillFor = 0;
  private steadyIndex: number | null = null;
  private endIndex: number | null = null;
  private peak = 0;

  /** The furthest from the stable start so far, degrees — what will be recorded. */
  get peakDegrees(): number {
    return this.peak;
  }

  /** 0–1 while stabilising: how much of the still hold has been made. 1 once past it. */
  get stableProgress(): number {
    return this.phase === "steady" ? Math.min(1, this.stillFor / STEADY_HOLD_S) : 1;
  }

  /** Feed one sample; returns the live angle from the steady pose, degrees. */
  add(time: number, quat: Quat): number {
    const i = this.q.length;
    this.t.push(time);
    this.q.push(quat);

    let speed = 0;
    if (i > 0) {
      const dt = time - this.t[i - 1]! || 1 / 225;
      speed = (angleOf(mul(conj(this.q[i - 1]!), quat)) * RAD) / dt;
    }
    this.speeds.push(speed);

    const dt = i > 0 ? time - this.t[i - 1]! || 1 / 225 : 1 / 225;
    const window = Math.max(1, Math.round(SMOOTH_S / dt));
    const recent = this.speeds.slice(-window);
    const smooth = recent.reduce((a, b) => a + b, 0) / recent.length;
    const still = smooth < STEADY_DEG_S;
    this.stillFor = still ? this.stillFor + dt : 0;

    const live = this.steadyIndex == null ? 0 : angleOf(mul(conj(this.q[this.steadyIndex]!), quat)) * RAD;
    // Only once the test is under way: the peak is how far it got, not where it ended.
    if (this.phase === "move" || this.phase === "moving") this.peak = Math.max(this.peak, live);

    if (this.phase === "steady" && this.stillFor >= STEADY_HOLD_S) {
      this.steadyIndex = i;
      this.phase = "move";
    } else if (this.phase === "move" && live > START_DEG) {
      this.phase = "moving";
      this.stillFor = 0;
    } else if (this.phase === "moving" && this.stillFor >= END_HOLD_S) {
      this.endIndex = i;
      this.phase = "done";
    }
    return live;
  }

  /** The measured range, or null if the limb was never held still and then moved. */
  finish(offsetDegrees: number): RomResult | null {
    if (this.steadyIndex == null || this.phase === "steady" || this.phase === "move") return null;
    const s = this.steadyIndex;
    const e = this.endIndex ?? this.q.length - 1;
    if (e - s < 50) return null;

    // The axis: where the limb's angular velocity points most of the time.
    const m = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let i = s + 1; i <= e; i++) {
      const v = logOf(mul(conj(this.q[i - 1]!), this.q[i]!));
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) m[a]![b]! += v[a]! * v[b]!;
    }
    const u = principalAxis(m);

    // The angle turned about that axis, from the steady pose, unwrapped.
    const ref = conj(this.q[s]!);
    let min = 0;
    let max = 0;
    let prev = 0;
    for (let i = s; i <= e; i++) {
      let r = mul(ref, this.q[i]!);
      if (r[0] < 0) r = [-r[0], -r[1], -r[2], -r[3]];
      let twist = 2 * Math.atan2(r[1] * u[0] + r[2] * u[1] + r[3] * u[2], r[0]);
      while (twist - prev > Math.PI) twist -= 2 * Math.PI;
      while (twist - prev < -Math.PI) twist += 2 * Math.PI;
      prev = twist;
      if (twist < min) min = twist;
      if (twist > max) max = twist;
    }

    const axis = (max - min) * RAD;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    return {
      romDegrees: r1(this.peak),
      excursionDegrees: r1(this.peak),
      axisDegrees: r1(axis),
      valdStyleDegrees: r1(this.peak + offsetDegrees),
      durationSeconds: Math.round((this.t[e]! - this.t[s]!) * 100) / 100,
    };
  }
}

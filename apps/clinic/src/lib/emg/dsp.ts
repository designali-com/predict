/**
 * EMG signal processing, as the band's apps do it (EMG-band repo,
 * desktop/src/signal/liveDsp.ts and research/pipelines/common/emgkit.py):
 *
 *   raw codes − mid-rail  →  50 Hz comb notch (50, 100, 150, 200 Hz)  →
 *   20 Hz Butterworth high-pass  →  RMS envelope.
 *
 * Everything works on plain number arrays at 500 Hz; the live chain is a
 * per-sample state machine, the offline one runs a whole channel at once.
 */

import { CLIP_HIGH, CLIP_LOW, EMG_HZ, MID_RAIL, UV_PER_CODE } from "./band"

interface Coeffs {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

class Biquad {
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0
  constructor(private c: Coeffs) {}
  step(x: number): number {
    const { b0, b1, b2, a1, a2 } = this.c
    const y = b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }
}

/** RBJ high-pass, Butterworth Q. */
function highPass(fs: number, f0: number): Coeffs {
  const w0 = (2 * Math.PI * f0) / fs
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) * Math.SQRT1_2 // sin(w0)/(2Q), Q = 1/√2
  const a0 = 1 + alpha
  return {
    b0: (1 + cos) / 2 / a0,
    b1: -(1 + cos) / a0,
    b2: (1 + cos) / 2 / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  }
}

/** Second-order notch by bandwidth: β = tan(π·bw/fs), g = 1/(1+β). */
function notch(fs: number, f0: number, bw: number): Coeffs {
  const beta = Math.tan((Math.PI * bw) / fs)
  const g = 1 / (1 + beta)
  const w0 = (2 * Math.PI * f0) / fs
  const c = -2 * Math.cos(w0) * g
  return { b0: g, b1: c, b2: g, a1: c, a2: 2 * g - 1 }
}

const MAINS_HZ = 50
const NOTCH_BW = 2
const HP_HZ = 20

/** One channel's live filter chain: centre, comb notch, high-pass. µV out. */
export class ChannelFilter {
  private stages: Biquad[]
  constructor(
    private centre = MID_RAIL,
    fs = EMG_HZ,
  ) {
    const harmonics: number[] = []
    for (let f = MAINS_HZ; f < fs / 2 - NOTCH_BW; f += MAINS_HZ) harmonics.push(f)
    this.stages = [...harmonics.map((f) => new Biquad(notch(fs, f, NOTCH_BW))), new Biquad(highPass(fs, HP_HZ))]
  }
  setCentre(c: number) {
    this.centre = c
  }
  step(code: number): number {
    let v = (code - this.centre) * UV_PER_CODE
    for (const s of this.stages) v = s.step(v)
    return v
  }
}

/** Filter a whole channel of raw codes. The first 0.2 s is the filters settling. */
export function filterChannel(codes: ArrayLike<number>, centre = estimateCentre(codes)): Float64Array {
  const f = new ChannelFilter(centre)
  const out = new Float64Array(codes.length)
  for (let i = 0; i < codes.length; i++) out[i] = f.step(codes[i]!)
  return out
}

/** Mid-rail as the band sits: the median of 0.1 s block means over the first 2 s. */
export function estimateCentre(codes: ArrayLike<number>, fs = EMG_HZ): number {
  const block = Math.round(fs / 10)
  const n = Math.min(codes.length, fs * 2)
  const means: number[] = []
  for (let i = 0; i + block <= n; i += block) {
    let s = 0
    for (let j = i; j < i + block; j++) s += codes[j]!
    means.push(s / block)
  }
  if (!means.length) return MID_RAIL
  means.sort((a, b) => a - b)
  return means[Math.floor(means.length / 2)]!
}

/** Moving RMS, centred, over `windowMs`. */
export function rmsEnvelope(x: ArrayLike<number>, windowMs = 250, fs = EMG_HZ): Float64Array {
  const w = Math.max(1, Math.round((windowMs / 1000) * fs))
  const half = Math.floor(w / 2)
  const out = new Float64Array(x.length)
  const sq = new Float64Array(x.length + 1)
  for (let i = 0; i < x.length; i++) sq[i + 1] = sq[i]! + x[i]! * x[i]!
  for (let i = 0; i < x.length; i++) {
    const a = Math.max(0, i - half)
    const b = Math.min(x.length, i - half + w)
    out[i] = Math.sqrt((sq[b]! - sq[a]!) / Math.max(1, b - a))
  }
  return out
}

/** Live RMS over the last `windowMs`, one sample at a time. */
export class LiveRms {
  private buf: Float64Array
  private i = 0
  private sum = 0
  private filled = 0
  constructor(windowMs = 100, fs = EMG_HZ) {
    this.buf = new Float64Array(Math.max(1, Math.round((windowMs / 1000) * fs)))
  }
  step(v: number): number {
    const sq = v * v
    this.sum += sq - this.buf[this.i]!
    this.buf[this.i] = sq
    this.i = (this.i + 1) % this.buf.length
    this.filled = Math.min(this.buf.length, this.filled + 1)
    return Math.sqrt(Math.max(0, this.sum) / this.filled)
  }
}

export const isClipped = (code: number) => code <= CLIP_LOW || code >= CLIP_HIGH

/** Average every `factor` points (for the stored chart envelope). */
export function decimate(x: ArrayLike<number>, factor: number): number[] {
  const out: number[] = []
  for (let i = 0; i < x.length; i += factor) {
    let s = 0
    let n = 0
    for (let j = i; j < Math.min(x.length, i + factor); j++) {
      s += x[j]!
      n++
    }
    out.push(Math.round((s / n) * 10) / 10)
  }
  return out
}

/** In-place radix-2 FFT on re/im (length a power of two). */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j]!, re[i]!]
      ;[im[i], im[j]] = [im[j]!, im[i]!]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k)
        const wi = Math.sin(ang * k)
        const ar = re[i + k + len / 2]!
        const ai = im[i + k + len / 2]!
        const tr = ar * wr - ai * wi
        const ti = ar * wi + ai * wr
        re[i + k + len / 2] = re[i + k]! - tr
        im[i + k + len / 2] = im[i + k]! - ti
        re[i + k] = re[i + k]! + tr
        im[i + k] = im[i + k]! + ti
      }
    }
  }
}

/**
 * Median and mean frequency of a filtered segment over 20–250 Hz, from a
 * Welch average of 0.5 s Hann windows, half-overlapped. Null when the segment
 * is shorter than one window.
 */
export function spectralFrequencies(x: ArrayLike<number>, fs = EMG_HZ): { mdf: number; mnf: number } | null {
  const n = 256
  if (x.length < n) return null
  const psd = new Float64Array(n / 2)
  const hann = new Float64Array(n)
  for (let i = 0; i < n; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  let windows = 0
  for (let start = 0; start + n <= x.length; start += n / 2) {
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let i = 0; i < n; i++) re[i] = x[start + i]! * hann[i]!
    fft(re, im)
    for (let k = 0; k < n / 2; k++) psd[k] = psd[k]! + re[k]! * re[k]! + im[k]! * im[k]!
    windows++
  }
  if (!windows) return null
  const df = fs / n
  let total = 0
  let weighted = 0
  const lo = Math.ceil(20 / df)
  const hi = Math.min(n / 2 - 1, Math.floor(250 / df))
  for (let k = lo; k <= hi; k++) {
    total += psd[k]!
    weighted += psd[k]! * k * df
  }
  if (total <= 0) return null
  let acc = 0
  let mdf = lo * df
  for (let k = lo; k <= hi; k++) {
    acc += psd[k]!
    if (acc >= total / 2) {
      mdf = k * df
      break
    }
  }
  return { mdf: Math.round(mdf * 10) / 10, mnf: Math.round((weighted / total) * 10) / 10 }
}

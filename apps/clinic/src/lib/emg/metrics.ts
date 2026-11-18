/**
 * What a recording says, per channel and per phase — the numbers the clinic
 * reads, worked out in the browser from the raw codes before saving.
 *
 * Methods follow the band's research kit (emgkit.py):
 *  - MVC reference: the highest 500 ms RMS of the recording on that channel.
 *  - Rest floor: RMS over the quiet phases (baseline / relax).
 *  - Onset: the first point the 100 ms envelope stays above μ + 4σ of rest for 50 ms.
 *  - Fatigue: median / mean frequency (20–250 Hz) over the active phases.
 *  - Co-contraction (Falconer & Winter): 200 · Σmin(a, b) / Σ(a + b) on the envelopes.
 *  - Quality: clipped samples > 2 %, a flat line (SD < 3 codes), counter gaps.
 *
 * These are flags for follow-up, not a diagnosis; the amplitudes are nominal
 * µV (gain 50, the band is not calibrated per unit).
 */

import { EMG_HZ } from "./band"
import { estimateCentre, filterChannel, isClipped, rmsEnvelope, spectralFrequencies } from "./dsp"
import { isRestMarker } from "./protocols"

export interface PhaseSpan {
  index: number
  marker: string
  side: string
  /** Seconds from the first sample. */
  start: number
  end: number
  /** A quiet phase (rest floor). Old recordings have none: read from the marker name then. */
  rest?: boolean
}

export interface ChannelMetrics {
  channel: number
  muscle: string
  /** RMS over the quiet phases, µV. */
  restUv: number | null
  /** Highest 500 ms RMS, µV — the reference phases are shown against. */
  peakUv: number
  /** Mean RMS over the active phases, µV. */
  activeUv: number | null
  /** Peak over rest — how clearly the muscle switched on. */
  signalToRest: number | null
  /** First onset after the first active phase began, seconds. */
  onsetSec: number | null
  mdfHz: number | null
  mnfHz: number | null
  clipPercent: number
  flatline: boolean
}

export interface PhaseMetrics extends PhaseSpan {
  /** Per channel: RMS µV, and that as % of the channel's peak. */
  channels: { rmsUv: number; percentPeak: number }[]
}

export interface EmgMetrics {
  channels: ChannelMetrics[]
  phases: PhaseMetrics[]
  /** Pairs of channels over the active phases, % (0 none — 100 fully together). */
  coContraction: { a: number; b: number; percent: number }[]
  quality: { gapPercent: number; flags: string[] }
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d

function rmsOf(x: ArrayLike<number>, from: number, to: number): number {
  let s = 0
  let n = 0
  for (let i = Math.max(0, from); i < Math.min(x.length, to); i++) {
    s += x[i]! * x[i]!
    n++
  }
  return n ? Math.sqrt(s / n) : 0
}

function sd(x: ArrayLike<number>): number {
  let m = 0
  for (let i = 0; i < x.length; i++) m += x[i]!
  m /= x.length || 1
  let v = 0
  for (let i = 0; i < x.length; i++) v += (x[i]! - m) ** 2
  return Math.sqrt(v / (x.length || 1))
}

/** Samples from `spans`, skipping the first 0.5 s of the recording (filters settling). */
function indicesOf(spans: PhaseSpan[], fs: number, length: number): [number, number][] {
  const settle = Math.round(0.5 * fs)
  return spans
    .map((p) => [Math.max(settle, Math.round(p.start * fs)), Math.min(length, Math.round(p.end * fs))] as [number, number])
    .filter(([a, b]) => b - a > fs * 0.2)
}

function concat(x: ArrayLike<number>, ranges: [number, number][]): Float64Array {
  const n = ranges.reduce((s, [a, b]) => s + (b - a), 0)
  const out = new Float64Array(n)
  let o = 0
  for (const [a, b] of ranges) for (let i = a; i < b; i++) out[o++] = x[i]!
  return out
}

export function computeMetrics(input: {
  /** Raw ADC codes per channel, one per sample at 500 Hz, gaps already filled. */
  codes: ArrayLike<number>[]
  /** What each channel records, in channel order (band 1 CH1–3, then band 2 CH1–3). */
  muscles: string[]
  /** Three channels per band; co-contraction is read between muscles under the same band. */
  channelsPerBand?: number
  phases: PhaseSpan[]
  missingSamples: number
  fs?: number
}): EmgMetrics {
  const fs = input.fs ?? EMG_HZ
  const length = input.codes[0]?.length ?? 0
  const isRest = (p: PhaseSpan) => p.rest ?? isRestMarker(p.marker)
  const rest = indicesOf(input.phases.filter(isRest), fs, length)
  const activePhases = input.phases.filter((p) => !isRest(p))
  const active = indicesOf(activePhases, fs, length)
  const settle = Math.round(0.5 * fs)
  const flags: string[] = []

  const filtered = input.codes.map((c) => filterChannel(c, estimateCentre(c, fs)))
  const env500 = filtered.map((x) => rmsEnvelope(x, 500, fs))
  const env100 = filtered.map((x) => rmsEnvelope(x, 100, fs))

  const channels: ChannelMetrics[] = input.codes.map((codes, ch) => {
    const x = filtered[ch]!
    let peak = 0
    for (let i = settle; i < length; i++) peak = Math.max(peak, env500[ch]![i]!)

    const restUv = rest.length ? rmsOf(concat(x, rest), 0, Infinity) : null
    const activeSamples = active.length ? concat(x, active) : null
    const activeUv = activeSamples ? rmsOf(activeSamples, 0, Infinity) : null
    const spectrum = activeSamples ? spectralFrequencies(activeSamples, fs) : null

    // Onset against the quiet phases' envelope.
    let onsetSec: number | null = null
    if (rest.length && active.length) {
      const quiet = concat(env100[ch]!, rest)
      let mu = 0
      for (const v of quiet) mu += v
      mu /= quiet.length || 1
      const threshold = mu + 4 * sd(quiet)
      const hold = Math.round(0.05 * fs)
      let run = 0
      for (let i = active[0]![0]; i < length; i++) {
        run = env100[ch]![i]! > threshold ? run + 1 : 0
        if (run >= hold) {
          onsetSec = round((i - hold + 1) / fs, 2)
          break
        }
      }
    }

    let clipped = 0
    for (let i = 0; i < codes.length; i++) if (isClipped(codes[i]!)) clipped++
    const clipPercent = codes.length ? round((clipped / codes.length) * 100) : 0
    const flatline = codes.length > fs && sd(codes) < 3
    const name = input.muscles[ch] || `Channel ${ch + 1}`
    if (clipPercent > 2) flags.push(`${name}: ${clipPercent}% of samples clipped — the electrode may be lifting, or the skin needs a better prep.`)
    if (flatline) flags.push(`${name}: a flat line — check the electrode and its lead.`)

    return {
      channel: ch + 1,
      muscle: name,
      restUv: restUv == null ? null : round(restUv),
      peakUv: round(peak),
      activeUv: activeUv == null ? null : round(activeUv),
      signalToRest: restUv && restUv > 0 ? round(peak / restUv) : null,
      onsetSec,
      mdfHz: spectrum?.mdf ?? null,
      mnfHz: spectrum?.mnf ?? null,
      clipPercent,
      flatline,
    }
  })

  const phases: PhaseMetrics[] = input.phases.map((p) => {
    const a = Math.max(settle, Math.round(p.start * fs))
    const b = Math.min(length, Math.round(p.end * fs))
    return {
      ...p,
      channels: filtered.map((x, ch) => {
        const rms = rmsOf(x, a, b)
        const peak = channels[ch]!.peakUv
        return { rmsUv: round(rms), percentPeak: peak > 0 ? Math.round((rms / peak) * 100) : 0 }
      }),
    }
  })

  const coContraction: EmgMetrics["coContraction"] = []
  if (active.length) {
    // On envelopes normalised to each channel's peak, so a big muscle does not swamp a small one.
    const norm = env100.map((e, ch) => {
      const peak = channels[ch]!.peakUv || 1
      return concat(e, active).map((v) => v / peak)
    })
    for (let a = 0; a < norm.length; a++) {
      for (let b = a + 1; b < norm.length; b++) {
        if (channels[a]!.flatline || channels[b]!.flatline) continue
        const per = input.channelsPerBand ?? 3
        if (Math.floor(a / per) !== Math.floor(b / per)) continue
        let common = 0
        let total = 0
        for (let i = 0; i < norm[a]!.length; i++) {
          common += Math.min(norm[a]![i]!, norm[b]![i]!)
          total += norm[a]![i]! + norm[b]![i]!
        }
        if (total > 0) coContraction.push({ a: a + 1, b: b + 1, percent: Math.round((200 * common) / total) })
      }
    }
  }

  const gapPercent = length + input.missingSamples > 0 ? round((input.missingSamples / (length + input.missingSamples)) * 100) : 0
  if (gapPercent > 1) flags.push(`${gapPercent}% of samples were lost over Bluetooth — keep the laptop closer to the band.`)
  if (!rest.length) flags.push("No quiet phase was recorded, so there is no rest floor to compare against.")

  return { channels, phases, coContraction, quality: { gapPercent, flags } }
}

/** Robinson asymmetry between a left and a right value: positive when right is higher. */
export function asymmetryPercent(left: number, right: number): number | null {
  const sum = left + right
  if (sum <= 0) return null
  return round(((right - left) / (0.5 * sum)) * 100)
}

import data from "./protocols.json"
import { allocate, COHORT, SITES, type CohortEntry, type CohortLimb, type CohortTask, type SiteId } from "./cohort"

/**
 * The armband's clinical protocols, as the Predict EMG apps ship them
 * (EMG-band repo, desktop/src/domain/assets/builtin-protocols.json, copied
 * as-is into protocols.json). A protocol says where each channel goes
 * (SENIAM site notes), the posture, and the timed phases with their cues.
 * There is no stable id upstream — the name is the key.
 */

export interface EmgPlacement {
  channel: number
  muscle: string
  side: string
  siteNotes: string
  /** Two-band protocols: proximal or distal band. */
  band?: string
}

export interface EmgPhase {
  marker: string
  durationSec: number
  cue: string
  side: string
  repeats: number
}

export interface EmgProtocol {
  name: string
  montage: string
  posture: string
  rationale: string
  interpretation: string
  placements: EmgPlacement[]
  trialCount: number
  restDurationSec: number
  contractionDurationSec: number
  cueText: string
  phases: EmgPhase[]
  bandCount?: number
}

export const EMG_PROTOCOLS: EmgProtocol[] = (data as { protocols: EmgProtocol[] }).protocols

/** One band is what the clinic runs today; two-band protocols need a second band. */
export const singleBand = (p: EmgProtocol) => (p.bandCount ?? 1) <= 1

/** A phase laid out on the clock: when it starts, when it ends, from the first sample. */
export interface TimedPhase {
  index: number
  marker: string
  cue: string
  side: string
  start: number
  end: number
  /** A quiet phase: the rest floor is read here. */
  rest: boolean
  /** Play the go tone as it starts. */
  go?: boolean
}

/** The phases in order with their repeats unrolled, each with its start and end second. */
export function timeline(protocol: EmgProtocol): TimedPhase[] {
  const out: TimedPhase[] = []
  let at = 0
  for (const phase of protocol.phases) {
    for (let r = 0; r < Math.max(1, phase.repeats); r++) {
      out.push({ index: out.length, marker: phase.marker, cue: phase.cue, side: phase.side, start: at, end: at + phase.durationSec, rest: isRestMarker(phase.marker) })
      at += phase.durationSec
    }
  }
  return out
}

export const totalSeconds = (protocol: EmgProtocol) => timeline(protocol).at(-1)?.end ?? 0

/** The phase running at `t` seconds, or null after the last one. */
export function phaseAt(phases: TimedPhase[], t: number): TimedPhase | null {
  return phases.find((p) => t >= p.start && t < p.end) ?? null
}

/** "rest" and "baseline" phases are the quiet ones the floor is read from. */
export const isRestMarker = (marker: string) => /^(baseline|rest|relax|quiet|still)/i.test(marker)

// ── One model for everything the runner can record ───────────────────────────

/** One band of a test: where it goes, and what each of its three channels records. */
export interface EmgBandPlan {
  /** cohort site (ua, fa, th, sh), or a protocol band (proximal, distal, band). */
  site: string
  label: string
  rule?: string
  /** Cohort bands: which way the USB-C port points so CH2 and CH3 land on their planned sides. */
  usbToward?: string
  hubLabel?: string
  channels: { ch: number; muscle: string; short?: string; where?: string; notes?: string }[]
}

export interface EmgTest {
  /** Stable id, saved with the recording. */
  key: string
  name: string
  /** "Cohort 3 Basics · Upper limb", or the protocol's montage. */
  group: string
  source: "cohort" | "protocol"
  bands: EmgBandPlan[]
  phases: TimedPhase[]
  tempo?: string
  posture?: string
  script: string[]
  entries: CohortEntry[]
  props: string[]
  optional?: boolean
  rationale?: string
  interpretation?: string
}

export const testSeconds = (t: EmgTest) => t.phases.at(-1)?.end ?? 0

/** "m:ss" for a length in seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** The bands a task uses (its devices), in order, with each channel's muscle for that side. */
export function cohortBands(ids: SiteId[], side: "left" | "right"): EmgBandPlan[] {
  return ids.map((id) => {
    const a = allocate(id, side)
    return {
      site: id,
      label: SITES[id].name,
      rule: SITES[id].site,
      usbToward: a.usbToward,
      hubLabel: SITES[id].hubLabel,
      channels: a.channels.map((c) => ({ ch: c.ch, muscle: c.name, short: c.short, where: c.where })),
    }
  })
}

/** A task of a battery: Cohort 3 Basics (by limb) or the Collection set. */
export function cohortTest(limb: Pick<CohortLimb, "name">, task: CohortTask, side: "left" | "right", battery: { id: string; name: string } = COHORT): EmgTest {
  let at = 0
  const phases: TimedPhase[] = task.phases.map((p, index) => {
    const out = { index, marker: p.id, cue: p.cue, side, start: at, end: at + p.durationSec, rest: p.effort === "rest", go: p.go }
    at += p.durationSec
    return out
  })
  return {
    key: `${battery.id}/${task.id}`,
    name: task.name,
    group: limb.name ? `${battery.name} · ${limb.name}` : battery.name,
    source: "cohort",
    bands: cohortBands(task.devices, side),
    phases,
    tempo: task.tempo,
    script: task.script,
    entries: task.entries,
    props: task.props,
    optional: task.optional,
  }
}

/** A built-in protocol; two-band ones split their placements by band (proximal, distal). */
export function protocolTest(p: EmgProtocol): EmgTest {
  const names = [...new Set(p.placements.map((x) => x.band ?? "band"))]
  const plans: EmgBandPlan[] = ((p.bandCount ?? 1) > 1 && names.length > 1 ? names : ["band"]).map((band) => {
    const mine = p.placements.filter((x) => (band === "band" ? true : x.band === band))
    const segment = (mine[0] as { segment?: string } | undefined)?.segment
    return {
      site: band,
      label: band === "band" ? "Band" : `${band[0]!.toUpperCase()}${band.slice(1)} band${segment ? ` (${segment})` : ""}`,
      channels: [1, 2, 3].map((ch) => {
        const at = mine.find((x) => x.channel === ch)
        return { ch, muscle: at?.muscle ?? "Not used", notes: at?.siteNotes }
      }),
    }
  })
  return {
    key: `protocol/${p.name}`,
    name: p.name,
    group: p.montage,
    source: "protocol",
    bands: plans,
    phases: timeline(p),
    posture: p.posture,
    script: [],
    entries: [],
    props: [],
    rationale: p.rationale,
    interpretation: p.interpretation,
  }
}

export { COHORT }

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeftRight,
  Battery,
  Bluetooth,
  BluetoothOff,
  Check,
  CircleStop,
  Clock,
  Flag,
  Info,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Ban,
  Save,
  SkipForward,
  Trash2,
  Volume2,
  Zap,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { EMG_HZ, MID_RAIL, type EmgChunk } from "@/src/lib/emg/band"
import { ChannelFilter, decimate, estimateCentre, filterChannel, isClipped, rmsEnvelope } from "@/src/lib/emg/dsp"
import { computeMetrics, type EmgMetrics, type PhaseSpan } from "@/src/lib/emg/metrics"
import { COHORT, COLLECTION, taskSeconds, type CohortEntry } from "@/src/lib/emg/cohort"
import { clock, cohortTest, EMG_PROTOCOLS, protocolTest, testSeconds, type EmgTest } from "@/src/lib/emg/protocols"
import { MAX_BANDS, subscribeEmg, useEmgBands, type BandSlot } from "@/src/lib/emg/use-emg-band"
import { useDynamo } from "@/src/lib/dynamo/use-dynamo"
import { CHANNEL_COLOURS, EmgEnvelopeChart, EmgMetricsView, type EmgEnvelope, type EmgMarker } from "./emg-result"

type Stage = "setup" | "recording" | "review" | "saving"
type Mode = "collection" | "cohort" | "protocol"

const PICK =
  "h-10 w-full rounded-md border border-black/25 bg-white px-2.5 text-sm text-black disabled:opacity-60 dark:border-white/20 dark:bg-black dark:text-white"
const BOX = "rounded-lg border border-black/15 bg-black/[0.03] p-3 dark:border-white/15 dark:bg-white/[0.05]"

/** One band's samples during a recording, kept out of React state. */
interface BandRecorder {
  codes: [number[], number[], number[]]
  first: number | null
  last: number
  missing: number
  /** Host clock of the first sample — what lines the bands up. */
  firstHost: number | null
}

/** "Save rest" / "Save MVC" during a recording (Android saveRest/saveMvcCalibration), per channel. */
interface Calibration {
  restUv?: number[]
  mvcUv?: number[]
  restAt?: number
  mvcAt?: number
}

interface Recorder {
  calibration: Calibration
  bands: Map<number, BandRecorder>
  /** The band the clock and the phases run on (the test's first band). */
  primary: number
  markers: EmgMarker[]
  spans: PhaseSpan[]
  force: { t: number[]; newtons: number[] }
}

const newBand = (): BandRecorder => ({ codes: [[], [], []], first: null, last: -1, missing: 0, firstHost: null })

interface Review {
  metrics: EmgMetrics
  envelope: EmgEnvelope
  duration: number
  /** All channels on one clock, in test band order. */
  codes: number[][]
  bands: { key: number; name: string; site: string; battery: number | null; offsetSamples: number; missing: number }[]
  missing: number
}

/** The go tone: one short, distinct beep through the computer's speakers. */
function useTone() {
  const ctx = useRef<AudioContext | null>(null)
  return {
    /** Unlock audio inside the Start click (browsers block sound until a gesture). */
    prime() {
      try {
        ctx.current ??= new AudioContext()
        void ctx.current.resume()
      } catch {
        // No audio: the cue on screen still changes.
      }
    },
    beep(freq = 1000, ms = 180) {
      const c = ctx.current
      if (!c) return
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, c.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.4, c.currentTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000)
      osc.connect(gain).connect(c.destination)
      osc.start()
      osc.stop(c.currentTime + ms / 1000 + 0.02)
    },
  }
}

/**
 * Record EMG with one or two Predict bands, optionally with a VALD DynaMo:
 * the Cohort 3 Basics battery (two bands, a task at a time, as the band's
 * dashboard runs it) or any single built-in protocol.
 */
export function EmgRunner({
  patientId,
  appointmentId,
  onSaved,
}: {
  patientId: string
  appointmentId?: string | null
  onSaved?: () => void
}) {
  const emg = useEmgBands()
  const dynamo = useDynamo()
  const tone = useTone()

  const [mode, setMode] = useState<Mode>("collection")
  const [limbId, setLimbId] = useState<"upper" | "lower">("lower")
  const [side, setSide] = useState<"left" | "right">("right")
  const limb = COHORT.limbs.find((l) => l.id === limbId)!
  const [taskId, setTaskId] = useState(limb.tasks[0]!.id)
  const [collectionId, setCollectionId] = useState(COLLECTION.tasks[0]!.id)
  /** When the bands went on the skin: the electrodes need about 10 minutes before a strongest effort. */
  const [donnedAt, setDonnedAt] = useState<number | null>(null)
  const [, setWallTick] = useState(0)
  useEffect(() => {
    if (donnedAt == null) return
    const t = setInterval(() => setWallTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [donnedAt])
  const [protocolName, setProtocolName] = useState(EMG_PROTOCOLS[0]!.name)
  const [done, setDone] = useState<Set<string>>(new Set())

  const test: EmgTest = useMemo(() => {
    if (mode === "collection") {
      const task = COLLECTION.tasks.find((t) => t.id === collectionId) ?? COLLECTION.tasks[0]!
      return cohortTest({ name: "" }, task, side, COLLECTION)
    }
    if (mode === "cohort") {
      const task = limb.tasks.find((t) => t.id === taskId) ?? limb.tasks[0]!
      return cohortTest(limb, task, side)
    }
    return protocolTest(EMG_PROTOCOLS.find((p) => p.name === protocolName) ?? EMG_PROTOCOLS[0]!)
  }, [mode, limb, taskId, collectionId, side, protocolName])
  const plan = test.phases

  const [entries, setEntries] = useState<Record<string, string>>({})
  const [onBattery, setOnBattery] = useState(false)
  const [useForce, setUseForce] = useState(false)
  const [stage, setStage] = useState<Stage>("setup")
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [notes, setNotes] = useState("")

  // The bands, in the order the test names them; each slot's site says which.
  const sites = test.bands.map((b) => b.site)
  useEffect(() => {
    // A band whose site is not one this test uses takes the first free one.
    for (const slot of emg.slots) {
      if (slot.site && sites.includes(slot.site)) continue
      const free = sites.find((s) => !emg.slots.some((x) => x.site === s))
      if (free) emg.setSite(slot.key, free)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites.join("|"), emg.slots.length])
  const slotFor = (site: string): BandSlot | undefined => emg.slots.find((s) => s.site === site)
  const linked = test.bands.map((b) => slotFor(b.site))
  const allLinked = linked.every(Boolean)
  const anyReconnecting = linked.some((s) => s?.state === "reconnecting")

  // Recording clock, from the first band's samples (500 a second), not the wall.
  const rec = useRef<Recorder>({ calibration: {}, bands: new Map(), primary: 0, markers: [], spans: [], force: { t: [], newtons: [] } })
  const [elapsed, setElapsed] = useState(0)
  const [phaseIdx, setPhaseIdxState] = useState(0)
  const phaseIdxRef = useRef(0)
  const setPhaseIdx = (i: number) => {
    phaseIdxRef.current = i
    setPhaseIdxState(i)
  }
  const phaseStart = useRef(0)
  /** Seconds the current phase has run — frozen while paused or while a band reconnects. */
  const phaseRun = useRef(0)
  const lastTick = useRef(0)
  /** A phase is open (started, not yet closed). */
  const phaseOpen = useRef(false)
  const [paused, setPausedState] = useState(false)
  const pausedRef = useRef(false)
  const setPaused = (v: boolean) => {
    pausedRef.current = v
    setPausedState(v)
  }
  const [scriptDone, setScriptDone] = useState(false)
  const [, setTickN] = useState(0)
  const [customMarker, setCustomMarker] = useState("")
  const [placementOk, setPlacementOk] = useState(false)
  const [sideOk, setSideOk] = useState(false)
  const [surface, setSurface] = useState("")
  const [footwear, setFootwear] = useState("")
  const reconnectingRef = useRef(false)
  reconnectingRef.current = anyReconnecting
  const finished = useRef(false)
  const stopForce = useRef(false)
  const unsub = useRef<(() => void) | null>(null)
  const forceOn = useForce && !!dynamo.device

  useEffect(
    () => () => {
      unsub.current?.()
      stopForce.current = true
    },
    [],
  )

  // A different test starts with its own blank numbers.
  useEffect(() => {
    if (stage === "setup") setEntries({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test.key])

  const primaryLength = () => rec.current.bands.get(rec.current.primary)?.codes[0].length ?? 0
  const now = () => primaryLength() / EMG_HZ

  function start() {
    if (!allLinked) return
    tone.prime()
    setError(null)
    setReview(null)
    finished.current = false
    phaseStart.current = 0
    phaseRun.current = 0
    lastTick.current = 0
    phaseOpen.current = true
    setPaused(false)
    setScriptDone(false)
    setPhaseIdx(0)
    setElapsed(0)
    const keys = linked.map((s) => s!.key)
    const r: Recorder = { calibration: {}, bands: new Map(keys.map((k) => [k, newBand()])), primary: keys[0]!, markers: [], spans: [], force: { t: [], newtons: [] } }
    rec.current = r
    unsub.current?.()
    unsub.current = subscribeEmg((key, chunk: EmgChunk) => {
      const b = r.bands.get(key)
      if (!b) return
      for (let i = 0; i < chunk.index.length; i++) {
        const at = chunk.index[i]!
        if (b.first === null) {
          b.first = at
          b.last = at - 1
          // The notification carries up to ten samples; the first of them came that much earlier.
          b.firstHost = chunk.hostMs - ((chunk.index.length - 1 - i) * 1000) / EMG_HZ
        }
        // Lost samples: hold the last value so time stays true (counted in `missing`).
        for (let fill = b.last + 1; fill < at; fill++) {
          for (let ch = 0; ch < 3; ch++) b.codes[ch]!.push(b.codes[ch]!.at(-1) ?? MID_RAIL)
          b.missing++
        }
        for (let ch = 0; ch < 3; ch++) b.codes[ch]!.push(chunk.codes[ch]![i]!)
        b.last = at
      }
    })
    if (forceOn && dynamo.device) {
      stopForce.current = false
      void dynamo.device
        .measure(
          dynamo.freq,
          (_t, newtons) => {
            const host = r.bands.get(r.primary)?.firstHost
            if (host == null) return
            r.force.t.push(Math.round(performance.now() - host) / 1000)
            r.force.newtons.push(Math.round(newtons * 10) / 10)
          },
          () => stopForce.current,
        )
        .catch((e) => toast.error(e instanceof Error ? `DynaMo: ${e.message}` : "The DynaMo stopped."))
    }
    setStage("recording")
    if (plan[0]?.go) tone.beep()
  }

  // The clock, the cues and the go tones.
  useEffect(() => {
    if (stage !== "recording") return
    const timer = setInterval(() => {
      const t = now()
      const dt = Math.max(0, t - lastTick.current)
      lastTick.current = t
      setElapsed(t)
      setTickN((n) => n + 1)
      // Paused by the operator, or by a band that is reconnecting: samples keep coming, the script waits.
      if (!phaseOpen.current || pausedRef.current || reconnectingRef.current) return
      phaseRun.current += dt
      const idx = phaseIdxRef.current
      const phase = plan[idx]
      if (!phase || phaseRun.current < phase.end - phase.start) return
      advance(idx, t)
    }, 50)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, plan])

  /** Close this phase and open the next; after the last the script is complete and the recording carries on. */
  function advance(idx: number, t: number) {
    closePhase(idx, t)
    if (idx + 1 >= plan.length) {
      phaseOpen.current = false
      setScriptDone(true)
      if (plan.length > 1 || plan[0]!.end > 0) tone.beep(660, 120)
      return
    }
    enterPhase(idx + 1, t)
  }

  function enterPhase(i: number, t: number) {
    phaseRun.current = 0
    phaseOpen.current = true
    setPhaseIdx(i)
    if (plan[i]?.go) {
      tone.beep()
      rec.current.markers.push({ t: Math.round(t * 1000) / 1000, label: "go" })
    }
  }

  function closePhase(idx: number, t: number) {
    const phase = plan[idx]
    if (!phase || !phaseOpen.current) return
    rec.current.spans.push({ index: idx, marker: phase.marker, side: phase.side, start: phaseStart.current, end: t, rest: phase.rest })
    phaseStart.current = t
  }

  /** Skip: end this phase now and go to the next. */
  function nextPhase() {
    if (!phaseOpen.current) return
    addMarker("skip")
    advance(phaseIdxRef.current, now())
  }

  /** Repeat: mark the phase again from now and restart its countdown. */
  function repeatPhase() {
    if (!phaseOpen.current) return
    addMarker("repeat")
    phaseStart.current = now()
    phaseRun.current = 0
    if (plan[phaseIdxRef.current]?.go) tone.beep()
  }

  function togglePause() {
    addMarker(pausedRef.current ? "resume" : "pause")
    setPaused(!pausedRef.current)
  }

  /** Run the whole script again; the recording carries on and the phases are marked again. */
  function runAgain() {
    setScriptDone(false)
    phaseStart.current = now()
    addMarker("script-again")
    enterPhase(0, now())
  }

  function addMarker(label: string, announce = false) {
    const t = now()
    rec.current.markers.push({ t: Math.round(t * 1000) / 1000, label })
    if (announce) toast.message(`Marker "${label}" at ${clock(t)}`)
  }

  function mark() {
    addMarker("tap", true)
  }

  /** The last two seconds of each channel's signal, as RMS and as its 100 ms peak. */
  function recentLevels() {
    const r = rec.current
    const out = { rms: [] as number[], peak: [] as number[] }
    for (const s of linked) {
      const b = s ? r.bands.get(s.key) : undefined
      for (let ch = 0; ch < 3; ch++) {
        const src = b?.codes[ch] ?? []
        const tail = src.slice(-EMG_HZ * 2.5)
        const env = rmsEnvelope(filterChannel(tail, estimateCentre(tail)), 100)
        const settled = env.slice(Math.floor(EMG_HZ * 0.5))
        let sum = 0
        let peak = 0
        for (const v of settled) {
          sum += v
          peak = Math.max(peak, v)
        }
        out.rms.push(Math.round((sum / Math.max(1, settled.length)) * 10) / 10)
        out.peak.push(Math.round(peak * 10) / 10)
      }
    }
    return out
  }

  /** "Save rest": the quiet level now (an MVC saved earlier stays). */
  function saveRest() {
    rec.current.calibration = { ...rec.current.calibration, restUv: recentLevels().rms, restAt: now() }
    addMarker("rest-saved")
    toast.success("Rest saved")
  }

  /** "Save MVC": the peak now — the patient's hardest effort (a rest saved earlier stays). */
  function saveMvc() {
    rec.current.calibration = { ...rec.current.calibration, mvcUv: recentLevels().peak, mvcAt: now() }
    addMarker("mvc-saved")
    toast.success("MVC saved")
  }

  /** Every band on the first band's clock: shifted by when its first sample arrived, cut to one length. */
  function alignBands(r: Recorder) {
    const order = linked.map((s) => s!.key)
    const primary = r.bands.get(r.primary)!
    const length = primary.codes[0].length
    const bands: Review["bands"] = []
    const codes: number[][] = []
    order.forEach((key, i) => {
      const b = r.bands.get(key)!
      const offset = b.firstHost != null && primary.firstHost != null ? Math.round(((b.firstHost - primary.firstHost) / 1000) * EMG_HZ) : 0
      for (const src of b.codes) {
        const out = new Array<number>(length)
        const firstValue = src[0] ?? MID_RAIL
        const lastValue = src.at(-1) ?? MID_RAIL
        for (let s = 0; s < length; s++) {
          const j = s - offset
          out[s] = j < 0 ? firstValue : j >= src.length ? lastValue : src[j]!
        }
        codes.push(out)
      }
      const slot = linked[i]!
      bands.push({
        key,
        name: slot.band.name,
        site: test.bands[i]!.site,
        battery: slot.band.batteryPercent,
        offsetSamples: offset,
        missing: b.missing + Math.max(0, length - offset - b.codes[0].length),
      })
    })
    return { codes, bands, length }
  }

  function finish() {
    if (finished.current) return
    finished.current = true
    unsub.current?.()
    unsub.current = null
    stopForce.current = true
    const r = rec.current
    const t = now()
    if (t < 1) {
      setStage("setup")
      setError("Less than a second was recorded — the band sent nothing. Check it is streaming, then start again.")
      return
    }
    if (phaseOpen.current && t - phaseStart.current > 0.2) closePhase(phaseIdxRef.current, t)
    phaseOpen.current = false
    setPaused(false)
    const { codes, bands } = alignBands(r)
    const muscles = test.bands.flatMap((b) => b.channels.map((c) => (test.bands.length > 1 ? `${b.label} · ${c.short ?? c.muscle}` : c.muscle)))
    const missing = bands.reduce((s, b) => s + b.missing, 0)
    const metrics = computeMetrics({ codes, muscles, phases: r.spans, missingSamples: Math.round(missing / bands.length) })
    const channels = codes.map((c) => decimate(rmsEnvelope(filterChannel(c, estimateCentre(c)), 100), EMG_HZ / 20))

    // Grip with the DynaMo on: each squeeze's peak, in kg, for the operator to check.
    if (r.force.t.length) {
      const filled: Record<string, string> = {}
      for (const e of test.entries) {
        const m = /^grip_kg_(\d+)$/.exec(e.id)
        if (!m) continue
        const span = r.spans.find((s) => s.marker === `squeeze-${m[1]}`)
        if (!span) continue
        let peak = 0
        r.force.t.forEach((ft, i) => {
          if (ft >= span.start - 0.5 && ft <= span.end + 1) peak = Math.max(peak, r.force.newtons[i]!)
        })
        if (peak > 0) filled[e.id] = (peak / 9.80665).toFixed(1)
      }
      setEntries((prev) => ({ ...filled, ...Object.fromEntries(Object.entries(prev).filter(([, v]) => v !== "")) }))
    }

    setReview({ metrics, envelope: { hz: 20, channels }, duration: t, codes, bands, missing })
    setStage("review")
  }

  function discard() {
    setReview(null)
    setNotes("")
    setStage("setup")
  }

  async function save() {
    if (!review) return
    setStage("saving")
    setError(null)
    const r = rec.current
    const channels = review.codes.length
    const n = review.codes[0]!.length
    const bytes = new Uint8Array(n * channels * 2)
    const view = new DataView(bytes.buffer)
    for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) view.setUint16((i * channels + c) * 2, review.codes[c]![i]!, true)
    let bin = ""
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    try {
      const res = await fetch(`/api/staff/patients/${patientId}/emg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocolName: test.name,
          montage: test.group,
          side,
          placements: test.bands,
          appointmentId: appointmentId ?? null,
          channelCount: channels,
          device: {
            band: review.bands.map((b) => b.name).join(" + "),
            battery: review.bands[0]?.battery ?? null,
            bands: review.bands.map(({ key: _key, ...b }) => b),
            dynamo: forceOn ? "DynaMo" : null,
            test: test.key,
          },
          samplesMissing: review.missing,
          markers: [...r.spans.map((s) => ({ t: s.start, label: s.marker, phase: s.index })), ...r.markers],
          metrics: {
            ...review.metrics,
            spans: r.spans,
            calibration: Object.keys(r.calibration).length ? r.calibration : undefined,
            session: {
              placementVerified: placementOk,
              sideConfirmed: sideOk,
              surface: surface.trim() || undefined,
              footwear: footwear.trim() || undefined,
            },
            entries: test.entries
              .filter((e) => entries[e.id] !== undefined && entries[e.id] !== "")
              .map((e) => ({ id: e.id, label: e.label, unit: e.unit ?? "", value: entries[e.id] })),
          },
          envelope: review.envelope,
          force: r.force.t.length ? thinForce(r.force) : null,
          notes,
          raw: btoa(bin),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not save the recording.")
      toast.success(`${test.name} saved`)
      setDone((d) => new Set(d).add(test.key))
      // On to the next task of the battery not yet done.
      if (mode === "collection") {
        const i = COLLECTION.tasks.findIndex((t) => t.id === collectionId)
        const next = COLLECTION.tasks.slice(i + 1).find((t) => !done.has(cohortTest({ name: "" }, t, side, COLLECTION).key))
        if (next) setCollectionId(next.id)
      }
      if (mode === "cohort") {
        const i = limb.tasks.findIndex((t) => t.id === taskId)
        const next = limb.tasks.slice(i + 1).find((t) => !done.has(cohortTest(limb, t, side).key))
        if (next) setTaskId(next.id)
      }
      discard()
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the recording.")
      setStage("review")
    }
  }

  const current = plan[phaseIdx]
  const phaseLeft = current ? Math.max(0, current.end - current.start - phaseRun.current) : 0
  const scriptElapsed = scriptDone ? testSeconds(test) : (current?.start ?? 0) + phaseRun.current
  const next = plan[phaseIdx + 1]
  const total = testSeconds(test)
  const busy = stage === "recording" || stage === "saving"
  const batterySeconds = limb.tasks.filter((t) => !t.optional).reduce((s, t) => s + taskSeconds(t), 0)

  return (
    <div className="flex flex-col gap-4">
      {/* What to record */}
      {stage === "setup" && (
        <>
          <div className="inline-flex self-start rounded-lg border border-black/10 bg-black/[0.06] p-0.5 text-xs font-medium dark:border-white/10 dark:bg-white/[0.07]">
            {(
              [
                ["collection", "Collection · 5 tasks"],
                ["cohort", "Cohort 3 Basics · 2 bands"],
                ["protocol", "Single protocol"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMode(k)}
                className={`rounded-md px-3 py-1.5 ${mode === k ? "bg-white text-black shadow-sm ring-1 ring-black/10 dark:bg-white/20 dark:text-white" : "text-black/65 dark:text-white/60"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "collection" ? (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
              <p className="self-end text-xs text-black/70 dark:text-white/65">
                The dashboard's collection: baseline with the elbow at 90°, hand gestures, loaded elbow curls, then two leg sets. Arm tasks use the upper-arm and forearm bands; leg tasks the thigh and shank bands.
              </p>
              <label className="flex flex-col gap-1 text-xs font-medium text-black/70 dark:text-white/65">
                Tested side (bands on)
                <select value={side} onChange={(e) => setSide(e.target.value as "left" | "right")} className={PICK}>
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </select>
              </label>
            </div>
          ) : mode === "cohort" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-black/70 dark:text-white/65">
                Limb
                <select
                  value={limbId}
                  onChange={(e) => {
                    const id = e.target.value as "upper" | "lower"
                    setLimbId(id)
                    setTaskId(COHORT.limbs.find((l) => l.id === id)!.tasks[0]!.id)
                  }}
                  className={PICK}
                >
                  {COHORT.limbs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} — {l.bands.replace(/\.$/, "")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-black/70 dark:text-white/65">
                Tested side (bands on)
                <select value={side} onChange={(e) => setSide(e.target.value as "left" | "right")} className={PICK}>
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
              <label className="flex flex-col gap-1 text-xs font-medium text-black/70 dark:text-white/65">
                Protocol
                <select value={protocolName} onChange={(e) => setProtocolName(e.target.value)} className={PICK}>
                  {[...new Set(EMG_PROTOCOLS.map((p) => p.montage))].map((montage) => (
                    <optgroup key={montage} label={montage}>
                      {EMG_PROTOCOLS.filter((p) => p.montage === montage).map((p) => {
                        const t = protocolTest(p)
                        return (
                          <option key={p.name} value={p.name}>
                            {p.name} · {clock(testSeconds(t))}
                            {t.bands.length > 1 ? " · 2 bands" : ""}
                          </option>
                        )
                      })}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-black/70 dark:text-white/65">
                Tested side
                <select value={side} onChange={(e) => setSide(e.target.value as "left" | "right")} className={PICK}>
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </select>
              </label>
            </div>
          )}

          {mode === "collection" && (
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1.5 text-xs text-black/70 dark:text-white/65">
                <Clock className="size-3.5" />
                {COLLECTION.tasks.length} tasks · {clock(COLLECTION.tasks.reduce((s, t) => s + taskSeconds(t), 0))} of recording, about 14–15 minutes with set-up and moving the bands
              </p>
              <ol className="flex flex-col divide-y divide-black/[0.1] overflow-hidden rounded-lg border border-black/15 dark:divide-white/[0.1] dark:border-white/15">
                {COLLECTION.tasks.map((t) => {
                  const on = t.id === collectionId
                  const saved = done.has(cohortTest({ name: "" }, t, side, COLLECTION).key)
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setCollectionId(t.id)}
                        className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${on ? "bg-primary/[0.1]" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}
                      >
                        <span
                          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                            saved ? "bg-emerald-500 text-white" : on ? "bg-primary text-white" : "bg-black/10 text-black/70 dark:bg-white/15 dark:text-white/75"
                          }`}
                        >
                          {saved ? <Check className="size-3.5" /> : t.order}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                            {t.name}
                            <span className="text-[11px] font-normal text-black/60 dark:text-white/55">
                              {t.devices.length === 1 ? "1 band" : "2 bands"} · {t.devices.map((d) => ({ ua: "upper arm", fa: "forearm", th: "thigh", sh: "shank" })[d]).join(" + ")}
                            </span>
                          </span>
                          <span className="block text-xs text-black/65 dark:text-white/60">{t.tempo}</span>
                        </span>
                        <span className="shrink-0 text-xs text-black/60 tabular-nums dark:text-white/55">{clock(taskSeconds(t))}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          {/* The battery's tasks, in the order they are run */}
          {mode === "cohort" && (
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1.5 text-xs text-black/70 dark:text-white/65">
                <Clock className="size-3.5" />
                {limb.tasks.length} tasks · about {Math.round(batterySeconds / 60)} min of recording without the optional ones, plus set-up and rests
              </p>
              <ol className="flex flex-col divide-y divide-black/[0.1] overflow-hidden rounded-lg border border-black/15 dark:divide-white/[0.1] dark:border-white/15">
                {limb.tasks.map((t) => {
                  const on = t.id === taskId
                  const saved = done.has(cohortTest(limb, t, side).key)
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setTaskId(t.id)}
                        className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${on ? "bg-primary/[0.1]" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}
                      >
                        <span
                          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                            saved ? "bg-emerald-500 text-white" : on ? "bg-primary text-white" : "bg-black/10 text-black/70 dark:bg-white/15 dark:text-white/75"
                          }`}
                        >
                          {saved ? <Check className="size-3.5" /> : t.order}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                            {t.name}
                            {t.optional && <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold text-black/60 uppercase dark:bg-white/15 dark:text-white/65">Optional</span>}
                          </span>
                          <span className="block text-xs text-black/65 dark:text-white/60">{t.tempo}</span>
                        </span>
                        <span className="shrink-0 text-xs text-black/60 tabular-nums dark:text-white/55">{clock(taskSeconds(t))}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </>
      )}

      {/* The bands: one row per band the test needs */}
      <div className="flex flex-col gap-2">
        {emg.status === "unsupported" && <p className="text-xs text-amber-700 dark:text-amber-400">Bluetooth needs Chrome or Edge on a laptop.</p>}
        {test.bands.map((plan, i) => {
          const slot = linked[i]
          return (
            <div key={plan.site} className="flex flex-col gap-2 rounded-lg border border-black/20 px-3 py-2.5 text-xs dark:border-white/20">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-sm font-semibold">
                  Band {i + 1} · {plan.label}
                </span>
                {slot ? (
                  <>
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className={`size-2 rounded-full ${slot.state === "reconnecting" ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`} />
                      {slot.band.name}
                      {slot.state === "reconnecting" && <span className="font-normal text-amber-700 dark:text-amber-400">reconnecting…</span>}
                    </span>
                    {slot.band.batteryPercent != null && (
                      <span className={`flex items-center gap-1 ${slot.band.batteryPercent < 20 ? "text-red-600" : "text-black/65 dark:text-white/60"}`}>
                        <Battery className="size-3.5" />
                        {slot.band.batteryPercent}%
                      </span>
                    )}
                    <span className="ml-auto flex gap-1">
                      {test.bands.length > 1 && emg.slots.length > 1 && (
                        <Button size="sm" variant="ghost" className="h-7" disabled={busy} title="Swap which band is where" onClick={() => emg.setSite(slot.key, test.bands[1 - i]!.site)}>
                          <ArrowLeftRight className="size-3.5" />
                          Swap
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => void emg.disconnect(slot.key)}>
                        <BluetoothOff className="size-3.5" />
                        Disconnect
                      </Button>
                    </span>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="ml-auto h-7"
                    disabled={busy || emg.status !== "ready" || emg.slots.length >= MAX_BANDS}
                    onClick={() => void emg.connect(plan.site)}
                  >
                    {emg.status === "connecting" ? <Loader2 className="size-3.5 animate-spin" /> : <Bluetooth className="size-3.5" />}
                    Connect band {i + 1}
                  </Button>
                )}
              </div>
              {stage === "setup" && (
                <div className="flex flex-col gap-1.5">
                  {plan.rule && <p className="text-black/70 dark:text-white/65">{plan.rule}</p>}
                  {(plan.hubLabel || plan.usbToward) && (
                    <p className="text-black/70 dark:text-white/65">
                      {plan.hubLabel ? `Hub (CH1): ${plan.hubLabel}.` : ""} {plan.usbToward ? `USB-C port toward the ${plan.usbToward}.` : ""}
                    </p>
                  )}
                  <ul className="flex flex-col gap-1">
                    {plan.channels.map((c) => (
                      <li key={c.ch} className="flex gap-2">
                        <span
                          className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                          style={{ background: CHANNEL_COLOURS[i * 3 + c.ch - 1] }}
                        >
                          {c.ch}
                        </span>
                        <span>
                          <span className="font-medium">{c.muscle}</span>
                          {c.where && <span className="text-black/60 dark:text-white/55"> · {c.where}</span>}
                          {c.notes && <span className="block text-black/60 dark:text-white/55">{c.notes}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
        {emg.error && (
          <p className="rounded-md bg-red-500/15 px-3 py-2 text-xs text-red-700 dark:text-red-400" onClick={emg.clearError}>
            {emg.error}
          </p>
        )}
      </div>

      {/* The DynaMo, for force alongside (the grip squeeze fills its kg from it) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-black/20 px-3 py-2 text-xs dark:border-white/20">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={useForce} disabled={busy} onChange={(e) => setUseForce(e.target.checked)} />
          Record force with the VALD DynaMo too
        </label>
        {useForce &&
          (dynamo.device ? (
            <>
              <span className="flex items-center gap-1.5 text-black/75 dark:text-white/70">
                <span className="size-2 rounded-full bg-emerald-500" />
                DynaMo connected
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={busy}
                onClick={() => dynamo.zero().then(() => toast.success("DynaMo zeroed"), (e) => toast.error(e instanceof Error ? e.message : "Zeroing failed"))}
              >
                {dynamo.zeroedAt ? "Zero again" : "Zero DynaMo"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="h-7" disabled={dynamo.status === "connecting" || dynamo.status === "unsupported"} onClick={() => void dynamo.connect()}>
              {dynamo.status === "connecting" ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
              Connect DynaMo
            </Button>
          ))}
        {useForce && dynamo.error && <span className="text-red-600">{dynamo.error}</span>}
      </div>

      {stage === "setup" && (
        <>
          {/* The task: what to say and do */}
          <div className={`${BOX} flex flex-col gap-2 text-sm`}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <p className="font-semibold">{test.name}</p>
              <p className="text-xs text-black/65 dark:text-white/60">
                {test.group} · {plan.length} phases · {clock(total)}
                {plan.some((p) => p.go) ? ` · ${plan.filter((p) => p.go).length} go tones` : ""}
              </p>
            </div>
            {test.posture && (
              <p>
                <span className="font-medium">Position: </span>
                {test.posture}
              </p>
            )}
            {test.script.length > 0 && (
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13px]">
                {test.script.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            )}
            {test.props.length > 0 && <p className="text-xs text-black/65 dark:text-white/60">You need: {test.props.join(", ")}</p>}
            {(test.rationale || test.interpretation) && (
              <details className="text-xs text-black/75 dark:text-white/70">
                <summary className="cursor-pointer font-medium">Why this test, and how to read it</summary>
                {test.rationale && <p className="mt-1.5">{test.rationale}</p>}
                {test.interpretation && <p className="mt-1.5">{test.interpretation}</p>}
              </details>
            )}
            {plan.some((p) => p.go) && (
              <p className="flex items-center gap-1.5 text-xs text-black/65 dark:text-white/60">
                <Volume2 className="size-3.5" />
                Turn the laptop&apos;s sound up: each tone means &quot;go&quot;. Use the laptop&apos;s own speakers, not Bluetooth ones (they delay the tone).
              </p>
            )}
          </div>

          {allLinked && <EmgScope keys={linked.map((s) => s!.key)} />}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-black/15 px-3 py-2 text-xs dark:border-white/15">
            <Clock className="size-3.5" />
            {donnedAt == null ? (
              <>
                <span className="text-black/70 dark:text-white/65">Electrodes settle for about 10 minutes after the bands go on.</span>
                <Button size="sm" variant="outline" className="h-7" onClick={() => setDonnedAt(Date.now())}>
                  The bands just went on
                </Button>
              </>
            ) : (
              (() => {
                const min = (Date.now() - donnedAt) / 60000
                return (
                  <>
                    <span className={min >= 10 ? "font-medium text-emerald-700 dark:text-emerald-400" : "font-medium text-amber-700 dark:text-amber-300"}>
                      Bands on for {clock(min * 60)}
                      {min >= 10 ? " — settled, ready for the strongest efforts" : ` — ${clock((10 - min) * 60)} until settled`}
                    </span>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setDonnedAt(Date.now())}>
                      Reset
                    </Button>
                  </>
                )
              })()
            )}
          </div>

          <div className={`${BOX} flex flex-col gap-2 text-sm`}>
            <p className="text-[11px] font-semibold tracking-[0.1em] text-black/60 uppercase dark:text-white/55">Checklist</p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={placementOk} onChange={(e) => setPlacementOk(e.target.checked)} />
              Placement verified — each pod on its muscle, the USB-C port the way it says above
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sideOk} onChange={(e) => setSideOk(e.target.checked)} />
              Side confirmed — {test.bands.length > 1 ? "both bands are" : "the band is"} on the {side} side
            </label>
            {((mode === "cohort" && limbId === "lower") || test.bands.some((b) => b.site === "th" || b.site === "sh")) && (
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={surface} onChange={(e) => setSurface(e.target.value)} placeholder="Surface (optional) — tiles, carpet…" className={PICK} />
                <input value={footwear} onChange={(e) => setFootwear(e.target.value)} placeholder="Footwear (optional) — own shoes, barefoot…" className={PICK} />
              </div>
            )}
            <p className="text-xs text-black/65 dark:text-white/60">
              <span className="font-medium">First cue:</span> {plan[0]?.cue}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/60 bg-amber-500/[0.12] px-3 py-2.5 text-xs text-amber-900 dark:text-amber-200">
            <label className="flex items-start gap-2 font-medium">
              <input type="checkbox" className="mt-0.5" checked={onBattery} onChange={(e) => setOnBattery(e.target.checked)} />
              {test.bands.length > 1 ? "Both bands are" : "The band is"} on their own battery — not on USB, not charging.
            </label>
            <p className="flex gap-1.5 pl-5 text-amber-800/80 dark:text-amber-200/70">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Never record on a patient while a band is plugged in. Clean and dry the skin first; for the strongest effort, let the electrodes settle about 10 minutes after placing them.
            </p>
          </div>

          {error && <p className="rounded-md bg-red-500/15 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</p>}

          <Button className="h-10 self-start" disabled={!allLinked || !onBattery || !placementOk || !sideOk || anyReconnecting} onClick={start}>
            <Play className="size-4" />
            {allLinked ? `Start ${test.name}` : `Connect ${test.bands.length > 1 ? "both bands" : "the band"} first`}
          </Button>
        </>
      )}

      {stage === "recording" && (
        <>
          <StatusStrip linked={linked} elapsed={elapsed} />

          {anyReconnecting && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/60 bg-amber-500/[0.12] px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
              <span>
                <span className="font-semibold">
                  {linked.filter((s) => s?.state === "reconnecting").map((s) => s!.band.name).join(", ")} disconnected. Reconnecting…
                </span>
                <span className="block text-xs">The recording stays open; the gap is marked. The script waits until the band is back.</span>
              </span>
            </div>
          )}

          {scriptDone ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/[0.1] px-4 py-5 text-center">
              <Check className="size-6 text-emerald-600" />
              <p className="text-xl font-semibold">Script complete</p>
              <p className="text-sm text-black/70 dark:text-white/65">Recording continues — add a pain marker, run the script again, or stop and review.</p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={runAgain}>
                  <RotateCcw className="size-4" />
                  Run script again
                </Button>
                <Button onClick={finish}>
                  <CircleStop className="size-4" />
                  Stop and review
                </Button>
              </div>
            </div>
          ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-primary/50 bg-primary/[0.1] px-4 py-5 text-center">
            <span className="text-[11px] text-black/60 tabular-nums dark:text-white/60">
              Phase {phaseIdx + 1} of {plan.length}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${
                current && !current.rest ? "bg-primary text-white" : "bg-black/15 text-black/75 dark:bg-white/15 dark:text-white/75"
              }`}
            >
              {current?.rest ? "Rest" : "Contract"} · {current?.marker.replace(/-/g, " ")}
            </span>
            <p className="text-xl font-semibold text-balance">{current?.cue ?? "Finishing…"}</p>
            <p className="text-4xl font-semibold tabular-nums">{Math.ceil(phaseLeft)}</p>
            {next && <p className="text-xs text-black/70 dark:text-white/65">Next: {next.cue}</p>}
            <div className="mt-1 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-black/15 dark:bg-white/15">
              <div className="h-full bg-primary transition-[width] duration-100" style={{ width: `${Math.min(100, (scriptElapsed / Math.max(1, total)) * 100)}%` }} />
            </div>
            <p className="text-[11px] text-black/60 tabular-nums dark:text-white/60">
              Script {clock(scriptElapsed)} of {clock(total)} · recording {clock(elapsed)}
              {paused ? " · paused" : ""}
            </p>
            {paused && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Task paused. Samples still recording.</p>}
          </div>
          )}

          <EmgScope keys={linked.map((s) => s!.key)} />

          {test.entries.length > 0 && <EntryForm entries={test.entries} values={entries} onChange={setEntries} />}

          {!scriptDone && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={togglePause}>
                {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                {paused ? "Continue" : "Pause"}
              </Button>
              <Button variant="outline" onClick={nextPhase}>
                <SkipForward className="size-4" />
                Skip
              </Button>
              <Button variant="outline" onClick={repeatPhase}>
                <RotateCcw className="size-4" />
                Repeat
              </Button>
              <Button variant="outline" onClick={() => addMarker("invalid", true)}>
                <Ban className="size-4" />
                Invalid
              </Button>
            </div>
          )}

          <div className={`${BOX} flex flex-col gap-2`}>
            <p className="text-[11px] font-semibold tracking-[0.1em] text-black/60 uppercase dark:text-white/55">Markers and calibration</p>
            <div className="flex flex-wrap gap-2">
              {["Rest", "Contract", "Pain"].map((l) => (
                <Button key={l} size="sm" variant="outline" className="h-8" onClick={() => addMarker(l.toLowerCase(), true)}>
                  <Flag className="size-3.5" />
                  {l}
                </Button>
              ))}
              <span className="flex items-center gap-1.5">
                <input
                  value={customMarker}
                  onChange={(e) => setCustomMarker(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customMarker.trim()) {
                      addMarker(customMarker.trim(), true)
                      setCustomMarker("")
                    }
                  }}
                  placeholder="Custom marker"
                  className="h-8 w-36 rounded-md border border-black/25 bg-white px-2 text-sm dark:border-white/20 dark:bg-black"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={!customMarker.trim()}
                  onClick={() => {
                    addMarker(customMarker.trim(), true)
                    setCustomMarker("")
                  }}
                >
                  Add
                </Button>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={saveRest}>
                Save rest
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={saveMvc}>
                Save MVC
              </Button>
              <span className="text-xs text-black/60 dark:text-white/55">
                {rec.current.calibration.restAt != null ? `Rest at ${clock(rec.current.calibration.restAt)}` : "No rest saved"} ·{" "}
                {rec.current.calibration.mvcAt != null ? `MVC at ${clock(rec.current.calibration.mvcAt)}` : "no MVC saved"}
              </span>
            </div>
          </div>

          {!scriptDone && (
            <Button variant="destructive" className="self-start" onClick={finish}>
              <CircleStop className="size-4" />
              Stop
            </Button>
          )}
        </>
      )}

      {(stage === "review" || stage === "saving") && review && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-medium">{test.name}</p>
            <p className="text-xs text-black/70 dark:text-white/65">
              {test.group} · {clock(review.duration)} · {side} side
              {review.missing ? ` · ${review.missing} samples lost` : ""}
              {review.bands.length > 1 ? ` · band 2 lined up ${((review.bands[1]!.offsetSamples / EMG_HZ) * 1000).toFixed(0)} ms from band 1` : ""}
            </p>
          </div>
          <EmgEnvelopeChart
            envelope={review.envelope}
            phases={rec.current.spans}
            markers={rec.current.markers}
            force={rec.current.force.t.length ? rec.current.force : null}
            muscles={test.bands.flatMap((b) => b.channels.map((c) => (test.bands.length > 1 ? `${b.label} · ${c.short ?? c.muscle}` : c.muscle)))}
          />
          {test.entries.length > 0 && <EntryForm entries={test.entries} values={entries} onChange={setEntries} />}
          {(rec.current.calibration.restUv || rec.current.calibration.mvcUv) && (
            <p className="text-xs text-black/70 dark:text-white/65">
              Calibration saved:{" "}
              {rec.current.calibration.restUv ? `rest ${rec.current.calibration.restUv.join(" / ")} µV` : ""}
              {rec.current.calibration.restUv && rec.current.calibration.mvcUv ? " · " : ""}
              {rec.current.calibration.mvcUv ? `MVC ${rec.current.calibration.mvcUv.join(" / ")} µV` : ""}
            </p>
          )}
          <EmgMetricsView metrics={review.metrics} />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional) — how the patient did, anything to recheck"
            rows={2}
            className="w-full rounded-md border border-black/25 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-black"
          />
          {error && <p className="rounded-md bg-red-500/15 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={stage === "saving"} onClick={() => void save()}>
              {stage === "saving" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save {mode === "protocol" ? "recording" : "task"}
            </Button>
            <Button variant="outline" disabled={stage === "saving"} onClick={discard}>
              <Trash2 className="size-4" />
              Discard
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/** The numbers the operator types in: seconds held, kg squeezed, the walking aid… */
function EntryForm({ entries, values, onChange }: { entries: CohortEntry[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const set = (id: string, v: string) => onChange({ ...values, [id]: v })
  return (
    <div className={`${BOX} flex flex-col gap-2`}>
      <p className="text-[11px] font-semibold tracking-[0.1em] text-black/60 uppercase dark:text-white/55">Results to type in</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((e) => (
          <label key={e.id} className="flex flex-col gap-1 text-xs font-medium text-black/75 dark:text-white/70">
            {e.label}
            {e.options ? (
              <select value={values[e.id] ?? ""} onChange={(ev) => set(e.id, ev.target.value)} className={PICK}>
                <option value="">—</option>
                {e.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={e.max}
                  step="any"
                  value={values[e.id] ?? ""}
                  onChange={(ev) => set(e.id, ev.target.value)}
                  className={PICK}
                />
                {e.unit && <span className="shrink-0 text-black/60 dark:text-white/55">{e.unit}</span>}
              </span>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}

/** Force thinned to at most ~50 points a second, so the row stays small. */
function thinForce(f: { t: number[]; newtons: number[] }) {
  const out = { t: [] as number[], newtons: [] as number[] }
  let lastT = -Infinity
  for (let i = 0; i < f.t.length; i++) {
    if (f.t[i]! - lastT < 0.02) continue
    lastT = f.t[i]!
    out.t.push(f.t[i]!)
    out.newtons.push(f.newtons[i]!)
  }
  return out
}

const SCOPE_SECONDS = 5

/**
 * The live signal of every connected band: three lanes per band, filtered,
 * the last five seconds, drawn on a canvas straight from the notifications.
 * Under it each channel's live RMS, and a warning when it clips or goes flat.
 */
function EmgScope({ keys }: { keys: number[] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [levels, setLevels] = useState<({ rms: number; clip: number; flat: boolean } | null)[]>([])
  const lanes = keys.length * 3

  useEffect(() => {
    const n = SCOPE_SECONDS * EMG_HZ
    type Lane = { ring: Float32Array; head: number; sq: number; clips: number; lo: number; hi: number; count: number }
    const state = new Map<number, { filters: ChannelFilter[] | null; warm: number[][]; lanes: Lane[] }>()
    for (const k of keys)
      state.set(k, {
        filters: null,
        warm: [[], [], []],
        lanes: [0, 1, 2].map(() => ({ ring: new Float32Array(n), head: 0, sq: 0, clips: 0, lo: Infinity, hi: -Infinity, count: 0 })),
      })

    const off = subscribeEmg((key, chunk) => {
      const s = state.get(key)
      if (!s) return
      for (let i = 0; i < chunk.index.length; i++) {
        // The first 0.5 s sets each channel's centre.
        if (!s.filters) {
          for (let ch = 0; ch < 3; ch++) s.warm[ch]!.push(chunk.codes[ch]![i]!)
          if (s.warm[0]!.length >= EMG_HZ / 2) s.filters = s.warm.map((w) => new ChannelFilter(estimateCentre(w)))
          continue
        }
        for (let ch = 0; ch < 3; ch++) {
          const code = chunk.codes[ch]![i]!
          const v = s.filters[ch]!.step(code)
          const l = s.lanes[ch]!
          l.ring[l.head] = v
          l.head = (l.head + 1) % n
          l.sq += v * v
          l.count++
          if (isClipped(code)) l.clips++
          l.lo = Math.min(l.lo, code)
          l.hi = Math.max(l.hi, code)
        }
      }
    })

    let raf = 0
    const draw = () => {
      const el = canvas.current
      const ctx = el?.getContext("2d")
      if (el && ctx) {
        const dpr = window.devicePixelRatio || 1
        const w = el.clientWidth
        const h = el.clientHeight
        if (el.width !== w * dpr) el.width = w * dpr
        if (el.height !== h * dpr) el.height = h * dpr
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, h)
        const laneH = h / (keys.length * 3)
        keys.forEach((k, b) => {
          const s = state.get(k)!
          s.lanes.forEach((l, ch) => {
            const idx = b * 3 + ch
            let peak = 50
            for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(l.ring[i]!))
            const mid = laneH * idx + laneH / 2
            ctx.strokeStyle = "rgba(127,127,127,0.4)"
            ctx.beginPath()
            ctx.moveTo(0, mid)
            ctx.lineTo(w, mid)
            ctx.stroke()
            ctx.strokeStyle = CHANNEL_COLOURS[idx]!
            ctx.lineWidth = 1
            ctx.beginPath()
            const per = n / w
            const scale = (laneH / 2 - 2) / peak
            for (let px = 0; px < w; px++) {
              let lo = Infinity
              let hi = -Infinity
              for (let q = Math.floor(px * per); q < Math.floor((px + 1) * per); q++) {
                const v = l.ring[(l.head + q) % n]!
                if (v < lo) lo = v
                if (v > hi) hi = v
              }
              if (lo === Infinity) continue
              ctx.moveTo(px + 0.5, mid - hi * scale)
              ctx.lineTo(px + 0.5, mid - lo * scale + 0.5)
            }
            ctx.stroke()
          })
        })
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    const tick = setInterval(() => {
      const out: ({ rms: number; clip: number; flat: boolean } | null)[] = []
      for (const k of keys) {
        for (const l of state.get(k)!.lanes) {
          out.push(l.count ? { rms: Math.sqrt(l.sq / l.count), clip: Math.round((l.clips / l.count) * 100), flat: l.hi - l.lo < 6 } : null)
          l.sq = 0
          l.clips = 0
          l.count = 0
          l.lo = Infinity
          l.hi = -Infinity
        }
      }
      setLevels(out)
    }, 250)

    return () => {
      off()
      cancelAnimationFrame(raf)
      clearInterval(tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join(",")])

  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={canvas}
        className="w-full rounded-lg border border-black/20 bg-black/[0.04] dark:border-white/20 dark:bg-white/[0.06]"
        style={{ height: lanes > 3 ? 288 : 176 }}
      />
      <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[11px]">
        {Array.from({ length: lanes }, (_, idx) => {
          const l = levels[idx]
          return (
            <span key={idx} className="flex items-center gap-1.5 tabular-nums">
              <span className="size-2 rounded-full" style={{ background: CHANNEL_COLOURS[idx] }} />
              {keys.length > 1 ? `B${Math.floor(idx / 3) + 1} ` : ""}Ch {(idx % 3) + 1}: {l ? `${l.rms.toFixed(0)} µV` : "—"}
              {l?.flat ? <span className="text-amber-600">flat — check lead</span> : l && l.clip > 2 ? <span className="text-red-600">clipping</span> : null}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Android's live status strip: each band's battery, samples and gaps; time; rate. */
function StatusStrip({ linked, elapsed }: { linked: (BandSlot | undefined)[]; elapsed: number }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-lg border border-black/15 px-3 py-2 text-xs dark:border-white/15">
      {linked.map((s, i) =>
        s ? (
          <span key={s.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 font-medium">
              <span className={`size-2 rounded-full ${s.state === "reconnecting" ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`} />B{i + 1} {s.band.name}
            </span>
            <Meta label="Battery" value={s.band.batteryPercent != null ? `${s.band.batteryPercent}%` : "—"} />
            <Meta label="Samples" value={s.band.received.toLocaleString("en-IN")} />
            <Meta label="Gaps" value={s.band.missing.toLocaleString("en-IN")} />
          </span>
        ) : null,
      )}
      <Meta label="Time" value={clock(elapsed)} />
      <Meta label="Rate" value={`${EMG_HZ} Hz`} />
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="tabular-nums">
      <span className="text-black/55 dark:text-white/50">{label} </span>
      <span className="font-medium">{value}</span>
    </span>
  )
}

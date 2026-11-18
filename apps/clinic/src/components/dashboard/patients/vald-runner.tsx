"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Bluetooth, BluetoothOff, CheckCircle2, CircleDot, ExternalLink, Info, Loader2, PlayCircle, RotateCcw, Square } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { VALD_TESTS, type ValdTestDef } from "@workspace/db/vald-catalog"
import { embedUrl, isVideoFile, useValdTests } from "@/src/lib/dynamo/use-vald-tests"
import { useDynamo } from "@/src/lib/dynamo/use-dynamo"
import type { Rep } from "@/src/lib/dynamo/analysis"
import {
  measureForceSide,
  measureRomSide,
  newtonsToKilograms,
  type ForceSideResult,
  type RomSideResult,
  type Side,
} from "@/src/lib/dynamo/session"
import { RecordBadge, RecordSegments } from "./record-ui"

type Phase = "idle" | "zeroing" | "measuring" | "saving"

interface TestProfile {
  testId: string | null
  name: string | null
  age: number | null
  ageSource: "dob" | "registration" | "test" | null
  sex: "Male" | "Female" | "Other" | null
}
type Result = ForceSideResult | RomSideResult
type RomPhase = "steady" | "move" | "moving" | "done"
type RepTarget = "1" | "2" | "3" | "open"

const SIDES: Side[] = ["left", "right"]

/** The number a side is recorded under: kilograms for force, degrees for ROM. */
function headline(r: Result | undefined): number | null {
  if (!r) return null
  if ("best" in r) return r.best ? newtonsToKilograms(r.best.peakNewtons) : null
  return r.result?.romDegrees ?? null
}

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp
const repSummary = (r: Rep) => ({
  peakNewtons: round(r.peakNewtons),
  timeToPeakSeconds: round(r.timeToPeakSeconds, 3),
  averageNewtons: round(r.averageNewtons),
  maxRfd: round(r.maxRfd),
  durationSeconds: round(r.endSeconds - r.startSeconds, 3),
})

/**
 * Runs a DynaMo test on the patient in the room, over Bluetooth, and files it
 * in our own records — against the patient, and against the visit when run
 * from one. No VALD account: the reading comes straight off the device.
 *
 * Nothing auto-saves. Every side stops at a number with Retake beside it, and
 * Save waits for the operator, because only the person watching knows whether
 * the patient did the movement properly.
 */
export function ValdRunner({
  patientId,
  prescribed: prescribedProp,
  appointmentId,
  onSaved,
}: {
  /** The chart id or the contact id. */
  patientId: string
  /** Catalogue keys from the patient's prescription, offered first. Fetched when not given. */
  prescribed?: string[]
  /** The consultation this is being run at. */
  appointmentId?: string
  onSaved: () => void
}) {
  const { device, status, freq, zeroedAt, error: linkError, clearError, connect, disconnect, zero } = useDynamo()
  const [fetchedPrescribed, setFetchedPrescribed] = useState<string[]>([])
  const [profile, setProfile] = useState<TestProfile | null>(null)
  // What the operator types when the record has no age or sex. A date of
  // birth is never needed — the age the patient gives is enough.
  const [ageInput, setAgeInput] = useState("")
  const [sexInput, setSexInput] = useState<"" | "Male" | "Female" | "Other">("")
  const prescribed = prescribedProp ?? fetchedPrescribed
  const [testKey, setTestKey] = useState<string>("")
  // The picker is three short steps — body part, then strength or ROM, then
  // the test — rather than one list of every DynaMo test.
  const [regionPick, setRegionPick] = useState<string | null>(null)
  const [kindPick, setKindPick] = useState<"force" | "rom" | null>(null)
  // Our own catalogue (vald_test_type): every DynaMo test, with VALD's steps
  // and video, as the clinic has set it up.
  const { tests: catalogue, byKey } = useValdTests()
  const [phase, setPhase] = useState<Phase>("idle")
  const [activeSide, setActiveSide] = useState<Side | null>(null)
  const [live, setLive] = useState(0)
  // ROM: the furthest from the stable start so far — the figure that is saved.
  const [peak, setPeak] = useState(0)
  const [romPhase, setRomPhase] = useState<RomPhase>("steady")
  const [stable, setStable] = useState(0)
  const [repTarget, setRepTarget] = useState<RepTarget>("3")
  const [repCount, setRepCount] = useState(0)
  const [bestKg, setBestKg] = useState<number | null>(null)
  const [results, setResults] = useState<Partial<Record<Side, Result>>>({})
  const [error, setError] = useState<string | null>(null)
  const stop = useRef({ requested: false })

  // The prescription's VALD tests, when the page did not pass them.
  useEffect(() => {
    if (prescribedProp) return
    fetch(`/api/staff/patients/${patientId}/exercise`)
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        const keys = (d?.prescription?.protocol?.exercises ?? [])
          .map((e: { vald?: string }) => e.vald)
          .filter((k: string | undefined): k is string => !!k)
        setFetchedPrescribed([...new Set<string>(keys)])
      })
      .catch(() => setFetchedPrescribed([]))
  }, [patientId, prescribedProp])

  // The patient's test profile: their own test id (from the patient code), and
  // the age and sex strength is compared against. Read again after a save,
  // which is when a first-time patient's chart — and so the id — is made.
  const [saves, setSaves] = useState(0)
  useEffect(() => {
    fetch(`/api/staff/patients/${patientId}/vald`)
      .then((r) => r.json().catch(() => null))
      .then((d) => setProfile(d?.profile ? { ...d.profile, testId: d.profile.testId ?? d.testProfileId ?? null } : null))
      .catch(() => setProfile(null))
  }, [patientId, saves])

  const age = profile?.age ?? (Number(ageInput) > 0 && Number(ageInput) < 120 ? Math.round(Number(ageInput)) : null)
  const sex = profile?.sex ?? (sexInput || null)
  const profileReady = age != null && !!sex

  const chosenKey = testKey || prescribed[0] || "grip-squeeze"
  const test = byKey(chosenKey) ?? VALD_TESTS[0]!
  // Neck and trunk tests are one measurement, not a left and a right.
  const sides: Side[] = test.laterality === "None" ? ["right"] : SIDES
  const isRom = test.kind === "rom"
  const busy = phase !== "idle"
  const linked = status === "connected" && !!device
  const wrongDevice = !!device && device.isGripOnly && !test.gripDeviceOk
  // Body parts in the order the clinic reaches for them; anything else after.
  const regions = useMemo(() => {
    const order = ["Hand", "Knee", "Shoulder", "Elbow", "Wrist", "Hip", "Ankle", "Neck", "Trunk", "Foot", "Scapula"]
    const present = [...new Set(catalogue.map((t) => t.region))]
    return present.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b))
  }, [catalogue])
  const region = regionPick ?? test.region
  const kinds = useMemo(() => {
    const has = new Set(catalogue.filter((t) => t.region === region).map((t) => t.kind))
    return (["force", "rom"] as const).filter((k) => has.has(k))
  }, [catalogue, region])
  const kind = kindPick && kinds.includes(kindPick) ? kindPick : region === test.region && kinds.includes(test.kind) ? test.kind : (kinds[0] ?? "force")
  const choices = useMemo(
    () =>
      catalogue
        .filter((t) => t.region === region && t.kind === kind)
        .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || a.label.localeCompare(b.label)),
    [catalogue, region, kind],
  )

  function pick(key: string) {
    if (busy) return
    setTestKey(key)
    setResults({})
    setError(null)
  }

  async function doZero() {
    setError(null)
    setPhase("zeroing")
    try {
      await zero()
      toast.success("Zeroed")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zeroing failed.")
    } finally {
      setPhase("idle")
    }
  }

  async function run(side: Side) {
    if (!device) return
    setError(null)
    setLive(0)
    setPeak(0)
    setRomPhase("steady")
    setStable(0)
    setRepCount(0)
    setBestKg(null)
    setResults((prev) => {
      const next = { ...prev }
      delete next[side]
      return next
    })
    stop.current = { requested: false }
    setActiveSide(side)
    setPhase("measuring")
    try {
      if (isRom) {
        const r = await measureRomSide(device, side, test.romOffsetDegrees, stop.current, {
          onLive: (deg, p, s, max) => {
            setLive(deg)
            setRomPhase(p)
            setStable(s)
            setPeak(max)
          },
        })
        if (r.result) setResults((prev) => ({ ...prev, [side]: r }))
        else setError(`No movement was measured on the ${side}. Hold still until it turns green, then move.`)
      } else {
        const r = await measureForceSide(device, side, freq, test.label, stop.current, {
          targetReps: repTarget === "open" ? null : Number(repTarget),
          onLive: (_t, n) => setLive(Math.max(0, n)),
          onRep: (_rep, count, best) => {
            setRepCount(count)
            setBestKg(newtonsToKilograms(best.peakNewtons))
          },
        })
        if (r.best) setResults((prev) => ({ ...prev, [side]: r }))
        else setError(`No effort was measured on the ${side}. Run it again.`)
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} If the DynaMo dropped out it reconnects by itself — then run this side again.`
          : "The measurement stopped.",
      )
    } finally {
      setPhase("idle")
      setActiveSide(null)
      setLive(0)
    }
  }

  async function save() {
    setError(null)
    setPhase("saving")
    const sideBody = (r: Result | undefined) => {
      if (!r) return null
      if ("best" in r) {
        const b = r.best!
        return {
          peakNewtons: b.peakNewtons,
          avgNewtons: b.averageNewtons,
          maxRfd: b.maxRfd,
          timeToPeakSeconds: b.timeToPeakSeconds,
          repCount: r.reps.length,
          reps: r.reps.map(repSummary),
          trace: r.trace,
        }
      }
      return {
        romDegrees: r.result!.romDegrees,
        repCount: 1,
        reps: [
          {
            romDegrees: r.result!.romDegrees,
            excursionDegrees: r.result!.excursionDegrees,
            axisDegrees: r.result!.axisDegrees,
            valdStyleDegrees: r.result!.valdStyleDegrees,
            durationSeconds: r.result!.durationSeconds,
          },
        ],
        trace: r.trace,
      }
    }
    try {
      const res = await fetch(`/api/staff/patients/${patientId}/vald/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test: test.key,
          appointmentId: appointmentId ?? null,
          profile: { age, sex },
          zeroed: zeroedAt !== null,
          left: sideBody(results.left),
          right: sideBody(results.right),
          sampleRateHz: isRom ? 225 : freq,
          device: { model: device?.info.device, serial: device?.info.serial, firmware: device?.info.version },
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not save the test.")
        return
      }
      toast.success(`${test.label} saved`)
      setResults({})
      setSaves((n) => n + 1)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the test.")
    } finally {
      setPhase("idle")
    }
  }

  const measured = sides.filter((s) => results[s])
  const unit = isRom ? "°" : "kg"
  const dp = isRom ? 0 : 1
  const left = headline(results.left)
  const right = headline(results.right)
  const asym =
    left != null && right != null && Math.max(left, right) > 0
      ? ((right - left) / Math.max(Math.abs(left), Math.abs(right))) * 100
      : null

  return (
    <div className="flex flex-col gap-3">
      {/* Whose test, and the device — one line. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10">
        <span className="font-mono text-black/60 dark:text-white/45">{profile?.testId ?? "New ID"}</span>
        {profile?.name && <span className="font-medium">{profile.name}</span>}
        {profile?.age != null ? (
          <span className="text-black/55 dark:text-white/40">{profile.age} y</span>
        ) : (
          <input
            type="number"
            min={1}
            max={119}
            value={ageInput}
            onChange={(e) => setAgeInput(e.target.value)}
            placeholder="Age"
            className="h-7 w-16 rounded-md border border-amber-400/60 bg-white px-2 text-sm dark:bg-black"
          />
        )}
        {profile?.sex ? (
          <span className="text-black/55 dark:text-white/40">{profile.sex}</span>
        ) : (
          <select
            value={sexInput}
            onChange={(e) => setSexInput(e.target.value as typeof sexInput)}
            className="h-7 rounded-md border border-amber-400/60 bg-white px-1.5 text-sm dark:bg-black"
          >
            <option value="">Sex</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        )}
        <span className="ml-auto flex items-center gap-2">
          {linked ? (
            <>
              <RecordBadge tone="good">
                <Bluetooth className="mr-1 size-3" /> {device.info.device ?? "DynaMo"}
                {device.info.battery ? ` · ${device.info.battery}` : ""}
              </RecordBadge>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={disconnect} disabled={busy} aria-label="Disconnect">
                <BluetoothOff className="size-3.5" />
              </Button>
            </>
          ) : status === "reconnecting" ? (
            <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <Loader2 className="size-3.5 animate-spin" /> Reconnecting…
            </span>
          ) : status === "unsupported" ? (
            <span className="text-black/55 dark:text-white/40">Bluetooth needs Chrome or Edge</span>
          ) : (
            <Button
              size="sm"
              className="h-9 px-3 text-sm"
              disabled={status === "connecting"}
              onClick={() => {
                clearError()
                void connect()
              }}
            >
              {status === "connecting" ? <Loader2 className="size-3.5 animate-spin" /> : <Bluetooth className="size-3.5" />}
              {status === "connecting" ? "Connecting…" : "Connect DynaMo"}
            </Button>
          )}
        </span>
      </div>
      {linkError && <p className="-mt-1 text-xs text-red-600">{linkError}</p>}

      {/* Which test: the prescribed ones as shortcuts, then body part →
          strength or ROM → the test. */}
      <div className="flex flex-col gap-2 rounded-lg border border-black/10 p-2.5 dark:border-white/10">
        {prescribed.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${STEP} mr-1`}>Prescribed</span>
            {prescribed.map((k) => {
              const p = byKey(k)
              if (!p) return null
              return (
                <Button key={k} size="sm" variant={k === chosenKey ? "default" : "outline"} className="h-9 px-3 text-sm" disabled={busy} onClick={() => pick(k)}>
                  {p.label}
                </Button>
              )
            })}
          </div>
        )}
        {/* Three dropdowns, one row on a tablet: body part, then strength or
            ROM, then only the tests that fit — never all of them at once. */}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,2fr)]">
          <label className="grid gap-1">
            <span className={STEP}>Body part</span>
            <select
              value={region}
              disabled={busy}
              onChange={(e) => {
                setRegionPick(e.target.value)
                setKindPick(null)
                const first = catalogue
                  .filter((c) => c.region === e.target.value)
                  .sort((a, b) => Number(!!b.featured) - Number(!!a.featured))[0]
                if (first) pick(first.key)
              }}
              className={PICK}
            >
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className={STEP}>Type</span>
            <select
              value={kind}
              disabled={busy || kinds.length < 2}
              onChange={(e) => {
                const k = e.target.value as "force" | "rom"
                setKindPick(k)
                const first = catalogue
                  .filter((c) => c.region === region && c.kind === k)
                  .sort((a, b) => Number(!!b.featured) - Number(!!a.featured))[0]
                if (first) pick(first.key)
              }}
              className={PICK}
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k === "rom" ? "ROM" : "Strength"}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className={STEP}>Test</span>
            <select value={choices.some((c) => c.key === test.key) ? test.key : ""} disabled={busy} onChange={(e) => e.target.value && pick(e.target.value)} className={PICK}>
              {!choices.some((c) => c.key === test.key) && <option value="">Choose a test…</option>}
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label.replace(new RegExp(`^${c.region}\\s+`, "i"), "").replace(/ ROM$/, "")} — {c.positionLabel}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <TestCard test={test} />
      {wrongDevice && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          This is a DynaMo Grip — it only does the grip squeeze. Connect a DynaMo or DynaMo Max for this test.
        </p>
      )}

      {/* Live, only while a side is being measured. */}
      {phase === "measuring" && activeSide &&
        (isRom ? (
          <RomLive side={activeSide} phase={romPhase} stable={stable} degrees={live} peak={peak} onFinish={() => (stop.current.requested = true)} />
        ) : (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-5 text-center">
            <p className="text-[11px] font-semibold tracking-[0.15em] text-primary uppercase">
              {activeSide === "left" ? "Left" : "Right"} · push / pull now
            </p>
            <p className="mt-1 text-5xl font-bold tabular-nums">
              {newtonsToKilograms(live).toFixed(1)}
              <span className="ml-1.5 text-xl font-medium text-black/45 dark:text-white/40">kg</span>
            </p>
            <p className="mt-1 text-xs text-black/60 dark:text-white/45">
              Rep {repCount}
              {repTarget !== "open" ? ` of ${repTarget}` : ""}
              {bestKg != null && ` · best ${bestKg.toFixed(1)} kg`}
            </p>
            <Button className="mt-3 h-11 px-6 text-base" onClick={() => (stop.current.requested = true)}>
              <Square className="size-3.5" /> Finish {activeSide}
            </Button>
          </div>
        ))}

      {linked && !wrongDevice && (
        <div className="flex flex-col gap-2.5">
          {!isRom && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
              <span className="flex items-center gap-1.5 text-xs">
                {zeroedAt ? (
                  <>
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                    Zeroed at {new Date(zeroedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                  </>
                ) : (
                  <>
                    <CircleDot className="size-3.5 text-amber-600" />
                    Not zeroed
                  </>
                )}
              </span>
              <Button size="sm" variant="outline" className="h-9 px-3 text-sm" onClick={doZero} disabled={busy}>
                {phase === "zeroing" && <Loader2 className="size-3.5 animate-spin" />}
                {phase === "zeroing" ? "Zeroing…" : zeroedAt ? "Zero again" : "Zero device"}
              </Button>
            </div>
          )}
          {!isRom && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-black/55 dark:text-white/40">
              Reps per side
              <RecordSegments<RepTarget>
                segments={[
                  { key: "1", label: "1" },
                  { key: "2", label: "2" },
                  { key: "3", label: "3" },
                  { key: "open", label: "Until I finish" },
                ]}
                active={repTarget}
                onChange={(k) => !busy && setRepTarget(k)}
              />
            </div>
          )}

          {sides.map((side) => {
            const value = headline(results[side])
            const r = results[side]
            const reps = r && "reps" in r ? r.reps.length : null
            return (
              <div key={side} className="flex items-center gap-3 rounded-lg border border-black/10 px-3 py-2 dark:border-white/10">
                <span className="w-12 text-sm font-medium">{side === "left" ? "Left" : test.laterality === "None" ? "Result" : "Right"}</span>
                <span className="ml-auto text-sm tabular-nums">
                  {value != null ? (
                    <b className="text-primary">
                      {value.toFixed(dp)} {unit}
                      {reps != null && <span className="ml-1.5 text-[11px] font-normal text-black/45 dark:text-white/35">best of {reps}</span>}
                    </b>
                  ) : (
                    <span className="text-black/45 dark:text-white/35">not taken</span>
                  )}
                </span>
                <Button size="sm" variant={value != null ? "outline" : "default"} className="h-10 min-w-24 px-4 text-sm" disabled={busy} onClick={() => run(side)}>
                  {value != null ? (
                    <>
                      <RotateCcw className="size-3.5" /> Retake
                    </>
                  ) : (
                    "Start"
                  )}
                </Button>
              </div>
            )
          })}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs text-black/55 dark:text-white/40">
              {!profileReady && measured.length > 0
                ? "Enter the patient's age and sex above to save."
                : asym != null
                  ? `Asymmetry ${Math.abs(asym).toFixed(1)}% (${asym > 0 ? "right" : "left"} stronger)`
                  : ""}
            </span>
            <Button className="h-10 px-5" onClick={save} disabled={busy || measured.length === 0 || !profileReady}>
              {phase === "saving" && <Loader2 className="size-4 animate-spin" />}
              {phase === "saving" ? "Saving…" : "Save test"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

const STEP = "text-[10px] font-semibold tracking-[0.1em] text-black/45 uppercase dark:text-white/35"
// Finger-sized for a tablet.
const PICK =
  "h-10 w-full rounded-md border border-black/15 bg-white px-2.5 text-sm text-black disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-white"

/**
 * The ROM screen, phase by phase as the DynaMo app shows it: amber while the
 * gyro settles (with how far through the hold it is), green when it is ready
 * for the movement, then the angle as it goes.
 */
function RomLive({
  side,
  phase,
  stable,
  degrees,
  peak,
  onFinish,
}: {
  side: Side
  phase: RomPhase
  stable: number
  degrees: number
  peak: number
  onFinish: () => void
}) {
  const look = {
    steady: { box: "border-amber-500/30 bg-amber-500/[0.07]", text: "text-amber-700 dark:text-amber-400", say: "Hold still — stabilising" },
    move: { box: "border-emerald-500/40 bg-emerald-500/[0.10]", text: "text-emerald-700 dark:text-emerald-400", say: "Ready — perform the movement" },
    moving: { box: "border-primary/25 bg-primary/[0.05]", text: "text-primary", say: "Keep going — hold at the end of the range" },
    done: { box: "border-emerald-500/40 bg-emerald-500/[0.10]", text: "text-emerald-700 dark:text-emerald-400", say: "Done" },
  }[phase]
  return (
    <div className={`rounded-xl border px-4 py-5 text-center transition-colors ${look.box}`}>
      <p className={`text-[11px] font-semibold tracking-[0.15em] uppercase ${look.text}`}>
        {side === "left" ? "Left" : "Right"} · {look.say}
      </p>
      {phase === "steady" ? (
        <div className="mx-auto mt-4 h-2 w-56 max-w-full overflow-hidden rounded-full bg-amber-500/15">
          <div className="h-full rounded-full bg-amber-500 transition-[width] duration-150" style={{ width: `${Math.round(stable * 100)}%` }} />
        </div>
      ) : (
        <>
          <p className="mt-1 text-5xl font-bold tabular-nums">
            {degrees.toFixed(0)}
            <span className="ml-1 text-xl font-medium text-black/45 dark:text-white/40">°</span>
          </p>
          {/* What is recorded is the furthest it got, not where the limb is
              now — said on screen, so bringing it back down does not look
              like losing the reading. */}
          <p className="mt-1 text-sm font-semibold tabular-nums">
            Max <span className="text-lg">{peak.toFixed(0)}°</span>
            <span className="ml-1.5 text-[11px] font-normal text-black/50 dark:text-white/40">this is what is saved</span>
          </p>
        </>
      )}
      <p className="mt-2 text-[11px] text-black/50 dark:text-white/40">
        {phase === "steady"
          ? "Keep the limb completely still until this turns green. Moving starts the wait again."
          : phase === "move"
            ? "Move through the full range at an even pace."
            : "Held still at the end for a second, it finishes by itself."}
      </p>
      <Button size="sm" variant="outline" className="mt-3" onClick={onFinish}>
        <Square className="size-3.5" /> Finish {side}
      </Button>
    </div>
  )
}

/**
 * What is about to be run: the test, how to set the patient up, and the how-to
 * video — VALD's for now, the clinic's own once one is put in its place. Worth
 * watching before an unfamiliar test: a pad in the wrong place is a wrong
 * number, not a slightly-off one.
 */
/**
 * VALD's protocol text, as written on their pages: a heading line ("Patient
 * position", "Contact point"…) and its text under it. Split so each reads as
 * a title and a paragraph rather than one undifferentiated block.
 */
const PROTOCOL_HEADINGS = [
  "patient position",
  "contact point",
  "device orientation",
  "position of examiner",
  "examiner position",
  "instruction",
  "instructions",
  "attachments",
  "attachment",
  "set-up",
  "setup",
  "notes",
  "note",
  "tips",
  "procedure",
  "test procedure",
  "starting position",
  "end position",
  "movement",
]
function protocolSections(text: string): { title: string | null; body: string }[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  const out: { title: string | null; body: string }[] = []
  for (const line of lines) {
    const bare = line.replace(/[:：]$/, "")
    if (PROTOCOL_HEADINGS.includes(bare.toLowerCase())) {
      out.push({ title: bare, body: "" })
    } else if (out.length) {
      const last = out[out.length - 1]!
      last.body = last.body ? `${last.body}\n${line}` : line
    } else {
      out.push({ title: null, body: line })
    }
  }
  return out.filter((s) => s.body)
}

function TestCard({ test }: { test: ValdTestDef }) {
  const [watching, setWatching] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const sections = useMemo(() => protocolSections(test.setup ?? ""), [test.setup])
  // A different test closes the video of the last one.
  const [shownFor, setShownFor] = useState(test.key)
  if (shownFor !== test.key) {
    setShownFor(test.key)
    setWatching(false)
    setShowSteps(false)
  }
  const video = test.videoUrl ?? null
  const embed = video && !isVideoFile(video) ? embedUrl(video) : null

  return (
    <div className="rounded-lg bg-black/[0.03] px-3 py-2.5 text-sm dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {test.label}
          <RecordBadge tone="primary">{test.kind === "rom" ? "Range of motion" : "Strength"}</RecordBadge>
          <span className="text-xs font-normal text-black/50 dark:text-white/40">{test.positionLabel}</span>
        </p>
        <span className="ml-auto flex items-center gap-1.5">
          {video && (
            <Button size="sm" variant={watching ? "default" : "outline"} className="h-9 px-3 text-sm" onClick={() => setWatching((w) => !w)}>
              <PlayCircle className="size-4" /> {watching ? "Hide video" : "Watch how"}
            </Button>
          )}
          {sections.length > 0 && (
            <Button
              size="sm"
              variant={showSteps ? "default" : "outline"}
              className="h-9 w-9 p-0"
              onClick={() => setShowSteps((s) => !s)}
              aria-label={showSteps ? "Hide how to do it" : "How to do it"}
              title="How to do it"
            >
              <Info className="size-4" />
            </Button>
          )}
        </span>
      </div>

      {watching && video && (
        <div className="mt-2.5 overflow-hidden rounded-md bg-black">
          {embed ? (
            <iframe
              src={`${embed}${embed.includes("?") ? "&" : "?"}autoplay=1`}
              title={`How to run: ${test.label}`}
              className="aspect-video w-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video src={video} controls autoPlay playsInline className="aspect-video w-full" />
          )}
        </div>
      )}

      {/* How to do it — only when asked for, as titled sections. */}
      {showSteps && (
        <div className="mt-2.5 grid gap-2.5 rounded-md border border-black/10 bg-white p-3 sm:grid-cols-2 dark:border-white/10 dark:bg-black">
          {sections.map((sec, i) => (
            <div key={i} className={sec.title ? "" : "sm:col-span-2"}>
              {sec.title && <p className="text-[11px] font-semibold tracking-wide text-primary uppercase">{sec.title}</p>}
              <p className="mt-0.5 whitespace-pre-line text-sm leading-snug text-black/80 dark:text-white/75">{sec.body}</p>
            </div>
          ))}
        </div>
      )}

      {showSteps && test.videoSource !== "clinic" && test.sourceUrl && (
        <a
          href={test.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-black/45 hover:underline dark:text-white/35"
        >
          Protocol by VALD <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  )
}

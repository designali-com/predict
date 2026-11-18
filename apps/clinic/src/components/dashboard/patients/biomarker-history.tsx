"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Minus } from "lucide-react"

interface MarkerRow {
  biomarkerId: string
  name: string
  shortCode: string
  unit: string | null
  rangeMin: number | null
  rangeMax: number | null
  direction: boolean
  value: number
  inRange: boolean | null
  previousValue: number | null
  previousOn: string | null
}

interface Panel {
  collectedOn: string
  markers: MarkerRow[]
}

interface Score {
  id: string
  indexShortCode: string
  indexName: string
  chronologicalAge: number
  biologicalAge: number
  deltaAge: number
  createdAt: string
}

interface ClockDomain {
  shortCode: string
  name: string
  measured: boolean
  share: number | null
  band: string | null
  severity: "normal" | "mild" | "moderate" | "severe" | "extreme" | null
  meanAbsZ: number | null
  contribution: number | null
}

/** The reading the patient's own clock is drawn from. */
interface Clock {
  biologicalAge: number
  chronologicalAge: number
  deltaAge: number
  compositeScore: number
  band: string | null
  calculatedAt: string
  measuredDomains: number
  mappedDomains: number
  topDomain: ClockDomain | null
  domains: ClockDomain[]
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/**
 * Whether a move is an improvement.
 *
 * Not "did the number go up" — for a marker whose bad direction is up, a fall
 * is good, and for one like haemoglobin it is the opposite. Colouring by raw
 * direction would call half the improvements a decline.
 */
function movement(row: MarkerRow): "better" | "worse" | "same" | null {
  if (row.previousValue == null) return null
  const change = row.value - row.previousValue
  if (change === 0) return "same"
  const roseIsBad = row.direction
  return change > 0 ? (roseIsBad ? "worse" : "better") : roseIsBad ? "better" : "worse"
}

const TONE = {
  better: "text-emerald-600 dark:text-emerald-400",
  worse: "text-red-600 dark:text-red-400",
  same: "text-black/50 dark:text-white/35",
} as const

const RISK_TONE: Record<NonNullable<ClockDomain["severity"]>, string> = {
  normal: "text-emerald-700 dark:text-emerald-400",
  mild: "text-lime-700 dark:text-lime-400",
  moderate: "text-amber-700 dark:text-amber-400",
  severe: "text-orange-700 dark:text-orange-400",
  extreme: "text-red-700 dark:text-red-400",
}

function cleanName(name: string, shortCode: string) {
  return name
    .replace(new RegExp(`\\s*\\(\\s*${shortCode}\\s*\\)\\s*:?\\s*$`, "i"), "")
    .replace(/[:\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
}

function yearsApart(delta: number) {
  const years = Math.round(Math.abs(delta))
  if (years === 0) return "the same as actual age"
  return `${years} year${years === 1 ? "" : "s"} ${delta > 0 ? "older" : "younger"}`
}

/**
 * Blood work over time for one patient.
 *
 * The clinic re-tests every few months, and the question at that point is never
 * "what is the number" but "what has it done since last time" — so every value
 * is shown against the one before it, and the biological age against the run
 * before it.
 */
export function BiomarkerHistory({ patientId }: { patientId: string }) {
  const [panels, setPanels] = useState<Panel[]>([])
  const [scores, setScores] = useState<Score[]>([])
  const [clock, setClock] = useState<Clock | null>(null)
  const [loading, setLoading] = useState(true)
  const [openPanel, setOpenPanel] = useState(0)

  useEffect(() => {
    let live = true
    fetch(`/api/staff/patients/${patientId}/biomarkers`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!live) return
        setPanels(data?.panels ?? [])
        setScores(data?.scores ?? [])
        setClock(data?.clock ?? null)
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [patientId])

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <PredictSpinner />
      </div>
    )
  }

  if (panels.length === 0 && !clock) {
    return (
      <p className="py-6 text-sm text-black/60 dark:text-white/40">
        No blood work recorded yet.
      </p>
    )
  }

  // Latest run per index, and the one before it for the comparison.
  const byIndex = new Map<string, Score[]>()
  for (const s of scores) {
    const list = byIndex.get(s.indexShortCode)
    if (list) list.push(s)
    else byIndex.set(s.indexShortCode, [s])
  }

  const panel = panels[openPanel]

  return (
    <div className="space-y-5">
      {clock && (
        <ReportReading
          clock={clock}
          previous={
            scores[1]
              ? { biologicalAge: scores[1].biologicalAge, createdAt: scores[1].createdAt }
              : null
          }
        />
      )}

      {!clock && byIndex.size > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {[...byIndex.entries()].map(([code, runs]) => {
            const latest = runs[0]!
            const before = runs[1]
            const shift = before ? latest.biologicalAge - before.biologicalAge : null
            return (
              <div
                key={code}
                className="rounded-md border border-black/12 p-3 dark:border-white/8"
              >
                <div className="text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
                  {latest.indexName || code}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-semibold">
                    {latest.biologicalAge.toFixed(1)}
                  </span>
                  <span className="text-xs text-black/60 dark:text-white/40">
                    vs {latest.chronologicalAge} actual
                  </span>
                </div>
                <div className="mt-1 text-xs">
                  <span className={latest.deltaAge > 0 ? TONE.worse : TONE.better}>
                    {latest.deltaAge > 0 ? "+" : ""}
                    {latest.deltaAge.toFixed(1)} yrs
                  </span>
                  {shift != null && (
                    <span className="ml-2 text-black/50 dark:text-white/35">
                      {shift > 0 ? "+" : ""}
                      {shift.toFixed(1)} since {shortDate(before!.createdAt)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {panels.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {/* Every draw the patient has had, newest first — the history the
              clinic compares against, not just the most recent number. */}
          {panels.map((p, i) => (
            <Button variant="ghost" size="sm"
              key={p.collectedOn}
              onClick={() => setOpenPanel(i)}
              className={`border px-2.5 py-1 text-xs ${
 i === openPanel
 ?"border-black/40 bg-black/5 font-medium dark:border-white/30 dark:bg-white/10"
 :"border-black/15 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
 }`}
            >
              {shortDate(p.collectedOn)}
            </Button>
          ))}
        </div>
      )}

      {panel && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-black/12 text-left text-[11px] tracking-widest text-black/50 uppercase dark:border-white/8 dark:text-white/35">
                <th className="pb-2 font-semibold">Marker</th>
                <th className="pb-2 text-right font-semibold">Value</th>
                <th className="pb-2 text-right font-semibold">Normal</th>
                <th className="pb-2 text-right font-semibold">Last test</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/8 dark:divide-white/5">
              {panel.markers.map((row) => {
                const move = movement(row)
                const Icon =
                  move === "same" || move == null
                    ? Minus
                    : row.value > (row.previousValue ?? 0)
                      ? ArrowUp
                      : ArrowDown
                return (
                  <tr key={row.biomarkerId}>
                    <td className="py-2 pr-3">
                      <div>{row.name}</div>
                      {row.unit && (
                        <div className="text-[11px] text-black/45 dark:text-white/30">
                          {row.unit}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={
                          row.inRange === false
                            ? "font-semibold text-red-600 dark:text-red-400"
                            : ""
                        }
                      >
                        {row.value}
                      </span>
                    </td>
                    <td className="py-2 text-right text-xs text-black/50 dark:text-white/35">
                      {row.rangeMin != null && row.rangeMax != null
                        ? `${row.rangeMin}–${row.rangeMax}`
                        : "—"}
                    </td>
                    <td className="py-2 text-right">
                      {row.previousValue == null ? (
                        <span className="text-xs text-black/40 dark:text-white/25">—</span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 text-xs ${TONE[move ?? "same"]}`}
                        >
                          <Icon className="h-3 w-3" />
                          {row.previousValue}
                          <span className="text-black/40 dark:text-white/25">
                            {row.previousOn ? shortDate(row.previousOn) : ""}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ReportReading({
  clock,
  previous,
}: {
  clock: Clock
  previous: { biologicalAge: number; createdAt: string } | null
}) {
  const measured = clock.domains.filter((d) => d.measured)
  const missing = clock.domains.filter((d) => !d.measured)
  const shift = previous ? clock.biologicalAge - previous.biologicalAge : null
  const top = clock.topDomain

  return (
    <div className="space-y-3 rounded-md border border-black/12 p-3 dark:border-white/8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
          What this blood report shows
        </p>
        <p className="text-[11px] text-black/45 dark:text-white/30">
          {shortDate(clock.calculatedAt)} · {clock.measuredDomains} of {clock.mappedDomains} domains
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md bg-black/5 px-3 py-2 dark:bg-white/5">
          <p className="text-[11px] text-black/50 dark:text-white/35">Biological age</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">{clock.biologicalAge.toFixed(1)}</p>
          <p className="mt-1 text-xs text-black/60 dark:text-white/45">
            {yearsApart(clock.deltaAge)} — against {Math.round(clock.chronologicalAge)}
          </p>
          {shift != null && previous && (
            <p className="mt-0.5 text-[11px] text-black/45 dark:text-white/30">
              {shift > 0 ? "+" : ""}
              {shift.toFixed(1)} since {shortDate(previous.createdAt)}
            </p>
          )}
        </div>

        <div className="rounded-md bg-black/5 px-3 py-2 dark:bg-white/5">
          <p className="text-[11px] text-black/50 dark:text-white/35">Minute hand</p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">{clock.compositeScore.toFixed(2)}</span>
            {clock.band && (
              <span className={`text-xs font-medium ${RISK_TONE[bandTone(clock.band)] ?? ""}`}>{clock.band}</span>
            )}
          </p>
          <p className="mt-1 text-xs text-black/60 dark:text-white/45">How fast the body is aging</p>
        </div>

        <div className="rounded-md bg-black/5 px-3 py-2 dark:bg-white/5">
          <p className="text-[11px] text-black/50 dark:text-white/35">Main risk domain</p>
          {top ? (
            <>
              <p className="mt-0.5 text-lg font-semibold">
                {top.shortCode}
                <span className="ml-2 text-sm font-medium tabular-nums text-black/70 dark:text-white/60">
                  {Math.round((top.share ?? 0) * 100)}%
                </span>
              </p>
              <p className="mt-1 text-xs text-black/60 dark:text-white/45">
                {cleanName(top.name, top.shortCode)}
                {top.band ? ` · ${top.band}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-black/50 dark:text-white/35">No domain was measured.</p>
          )}
        </div>
      </div>

      {measured.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold tracking-widest text-black/50 uppercase dark:text-white/35">
            Risk domains
          </p>
          <ul className="divide-y divide-black/8 dark:divide-white/5">
            {measured.map((d) => (
              <li key={d.shortCode} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span>
                  <span className="font-medium">{d.shortCode}</span>
                  <span className="ml-2 text-black/60 dark:text-white/45">{cleanName(d.name, d.shortCode)}</span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className={d.severity ? RISK_TONE[d.severity] : "text-black/50"}>{d.band ?? d.severity}</span>
                  <span className="ml-2 tabular-nums text-black/45 dark:text-white/30">
                    {Math.round((d.share ?? 0) * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {missing.length > 0 && (
            <p className="mt-2 text-[11px] text-black/45 dark:text-white/30">
              Not on this report: {missing.map((d) => d.shortCode).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function bandTone(label: string): NonNullable<ClockDomain["severity"]> {
  const key = label.toLowerCase()
  if (key === "normal" || key === "mild" || key === "moderate" || key === "severe" || key === "extreme") return key
  return "moderate"
}

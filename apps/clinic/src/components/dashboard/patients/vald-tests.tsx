"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { ChevronRight, Printer } from "lucide-react"
import { RecordSegments } from "./record-ui"
import { ValdTrendChart, type TrendPoint } from "./vald-trend-chart"

interface Side {
  peakForceNewtons: number | null
  avgForceNewtons: number | null
  peakRfdNewtonsPerSecond: number | null
  timeToPeakForceSeconds: number | null
  impulseNewtonSeconds: number | null
  rangeOfMotionDegrees: number | null
  repCount: number | null
}

interface Test {
  id: string
  testCategory: string | null
  bodyRegion: string | null
  movement: string | null
  position: string | null
  testedAt: string
  asymmetryPercent: number | null
  sides: { left: Side | null; right: Side | null } | null
  muscleAge?: number | null
  strengthPercentile?: number | null
  romPercentOfNormal?: number | null
}

interface Status {
  /** The chart id — null for somebody whose first test has not made one yet. */
  patientId: string | null
  tests: Test[]
}


const G = 9.80665

/**
 * The measures VALD's own app puts on a DynaMo report.
 *
 * Everything here was checked against 152 real test summaries from the clinic's
 * own tenant. The API also declares net-force and windowed-RFD fields, which
 * came back null on every single test — they are left out rather than shown as
 * permanently empty columns.
 */
const METRICS = [
  {
    key: "peak",
    label: "Peak force",
    unit: "kg",
    decimals: 1,
    of: (s: Side | null) => (s?.peakForceNewtons != null ? s.peakForceNewtons / G : null),
    strengthOnly: true,
  },
  // Stored in newtons, as the device measures; shown in kilograms, which is
  // what the clinic and the patient read force in.
  {
    key: "avg",
    label: "Average force",
    unit: "kg",
    decimals: 1,
    of: (s: Side | null) => (s?.avgForceNewtons != null ? s.avgForceNewtons / G : null),
    strengthOnly: true,
  },
  {
    key: "rfd",
    label: "Peak RFD",
    unit: "kg/s",
    decimals: 0,
    of: (s: Side | null) => (s?.peakRfdNewtonsPerSecond != null ? s.peakRfdNewtonsPerSecond / G : null),
    strengthOnly: true,
  },
  {
    key: "ttp",
    label: "Time to peak force",
    unit: "s",
    decimals: 2,
    of: (s: Side | null) => s?.timeToPeakForceSeconds ?? null,
    strengthOnly: true,
  },
  {
    key: "impulse",
    label: "Impulse",
    unit: "kg·s",
    decimals: 1,
    of: (s: Side | null) => (s?.impulseNewtonSeconds != null ? s.impulseNewtonSeconds / G : null),
    strengthOnly: true,
  },
  {
    key: "rom",
    label: "Range of motion",
    unit: "°",
    decimals: 0,
    of: (s: Side | null) => s?.rangeOfMotionDegrees ?? null,
    strengthOnly: false,
  },
] as const

type MetricKey = (typeof METRICS)[number]["key"]

function spaced(value: string | null): string {
  if (!value) return ""
  return value.replace(/([a-z])([A-Z])/g, "$1 $2")
}

function testDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function fmt(value: number | null, decimals: number): string {
  return value == null ? "—" : value.toFixed(decimals)
}

/**
 * Muscle strength testing on the VALD DynaMo.
 *
 * Grouped by what was tested rather than listed test by test, because that is
 * how the question is asked: not "what happened on Tuesday" but "what has this
 * patient's grip done since we started".
 */
function ordinal(n: number): string {
  const v = n % 100
  const s = v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"
  return `${n}${s}`
}

export function ValdTests({ patientId }: { patientId: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [metric, setMetric] = useState<MetricKey>("peak")
  const [printRange, setPrintRange] = useState<"day" | "week" | "all">("day")

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/patients/${patientId}/vald`)
    const data = await res.json().catch(() => null)
    if (res.ok) setStatus(data)
  }, [patientId])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  // One entry per thing tested, oldest first inside each so a trend reads left
  // to right.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; title: string; category: string; tests: Test[] }>()
    for (const t of status?.tests ?? []) {
      // ROM and strength of the same movement are two tests, and so are the
      // same movement seated and prone — keyed on all four, or one hides the other.
      const key = `${t.testCategory}|${t.bodyRegion}|${t.movement}|${t.position}`
      const where = t.position && t.position !== "Neutral" ? ` · ${spaced(t.position).toLowerCase()}` : ""
      const title = `${spaced(t.bodyRegion)} ${spaced(t.movement).toLowerCase()}${where}`.trim()
      const found = map.get(key)
      if (found) found.tests.push(t)
      else map.set(key, { key, title, category: t.testCategory ?? "", tests: [t] })
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        tests: [...g.tests].sort(
          (a, b) => new Date(a.testedAt).getTime() - new Date(b.testedAt).getTime(),
        ),
      }))
      .sort((a, b) => {
        const last = (g: typeof a) => new Date(g.tests[g.tests.length - 1]!.testedAt).getTime()
        return last(b) - last(a)
      })
  }, [status])

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <PredictSpinner />
      </div>
    )
  }

  if (!status) {
    return <p className="py-6 text-sm text-black/60 dark:text-white/40">Could not load the tests.</p>
  }

  const open = groups.find((g) => g.key === openGroup)
  const isRom = open?.category === "RangeofMotion"
  const available = METRICS.filter((m) => (isRom ? !m.strengthOnly : m.strengthOnly))
  const chosen = available.find((m) => m.key === metric) ?? available[0]!

  const points: TrendPoint[] = (open?.tests ?? []).map((t) => ({
    date: t.testedAt,
    left: chosen.of(t.sides?.left ?? null),
    right: chosen.of(t.sides?.right ?? null),
  }))

  const TH = "px-2 py-2 text-[10px] font-semibold tracking-wider text-black/50 uppercase dark:text-white/40"
  const TD = "px-2 py-2.5 tabular-nums whitespace-nowrap"

  return (
    <div className="space-y-3">
      {/* Print: pick what goes on the sheet, then one button. Only offered once
          there is something to print. */}
      {groups.length > 0 && status.patientId && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            value={printRange}
            onChange={(e) => setPrintRange(e.target.value as typeof printRange)}
            className="h-9 rounded-md border border-black/15 bg-white px-2.5 text-sm dark:border-white/10 dark:bg-black dark:text-white"
            aria-label="What to print"
          >
            <option value="day">Last session</option>
            <option value="week">Past week</option>
            <option value="all">Complete history</option>
          </select>
          <Button
            className="h-9 px-4"
            nativeButton={false}
            render={<a href={`/vald-report/${status.patientId}?range=${printRange}`} target="_blank" rel="noreferrer" />}
          >
            <Printer className="h-4 w-4" /> Print report
          </Button>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="py-4 text-sm text-black/60 dark:text-white/40">No tests yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-black/[0.03] text-left dark:bg-white/[0.04]">
              <tr>
                <th className={TH}>Test</th>
                <th className={`${TH} text-right`}>Tests</th>
                <th className={TH}>Last</th>
                <th className={`${TH} text-right`}>Left</th>
                <th className={`${TH} text-right`}>Right</th>
                <th className={`${TH} text-right`}>Diff</th>
                <th className={`${TH} text-right`}>Muscle age / ROM</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const latest = g.tests[g.tests.length - 1]!
                const isOpen = g.key === openGroup
                const rom = g.category === "RangeofMotion"
                const unit = rom ? "°" : " kg"
                const dp = rom ? 0 : 1
                const l = rom ? (latest.sides?.left?.rangeOfMotionDegrees ?? null) : latest.sides?.left?.peakForceNewtons != null ? latest.sides.left.peakForceNewtons / G : null
                const r = rom ? (latest.sides?.right?.rangeOfMotionDegrees ?? null) : latest.sides?.right?.peakForceNewtons != null ? latest.sides.right.peakForceNewtons / G : null
                const asym = latest.asymmetryPercent
                return (
                  <Fragment key={g.key}>
                    <tr
                      onClick={() => {
                        setOpenGroup(isOpen ? null : g.key)
                        setMetric(rom ? "rom" : "peak")
                      }}
                      className={`cursor-pointer border-t border-black/[0.06] hover:bg-black/[0.02] dark:border-white/[0.06] dark:hover:bg-white/[0.03] ${isOpen ? "bg-primary/[0.04]" : ""}`}
                    >
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-1.5 font-medium">
                          <ChevronRight className={`h-4 w-4 shrink-0 text-black/40 transition-transform dark:text-white/30 ${isOpen ? "rotate-90" : ""}`} />
                          {g.title}
                          {rom && <span className="rounded bg-black/[0.05] px-1 text-[10px] font-semibold text-black/55 dark:bg-white/10 dark:text-white/50">ROM</span>}
                        </span>
                      </td>
                      <td className={`${TD} text-right text-black/60 dark:text-white/45`}>{g.tests.length}</td>
                      <td className={`${TD} text-black/60 dark:text-white/45`}>{testDate(latest.testedAt)}</td>
                      <td className={`${TD} text-right`}>{l == null ? "—" : `${fmt(l, dp)}${unit}`}</td>
                      <td className={`${TD} text-right`}>{r == null ? "—" : `${fmt(r, dp)}${unit}`}</td>
                      <td className={`${TD} text-right`}>
                        {asym == null ? (
                          <span className="text-black/30 dark:text-white/20">—</span>
                        ) : (
                          <span className={Math.abs(asym) >= 15 ? "font-semibold text-red-600 dark:text-red-400" : ""}>{Math.abs(asym).toFixed(1)}%</span>
                        )}
                      </td>
                      <td className={`${TD} text-right`}>
                        {rom
                          ? latest.romPercentOfNormal != null
                            ? `${Math.round(latest.romPercentOfNormal)}% of normal`
                            : "—"
                          : latest.muscleAge != null
                            ? <><b>{Math.round(latest.muscleAge)}</b> yrs{latest.strengthPercentile != null && <span className="text-black/50 dark:text-white/40"> · {ordinal(latest.strengthPercentile)} pct</span>}</>
                            : "—"}
                      </td>
                    </tr>
                    {isOpen && open && (
                      <tr className="border-t border-black/[0.06] dark:border-white/[0.06]">
                        <td colSpan={7} className="bg-black/[0.015] px-3 py-3 dark:bg-white/[0.02]">
                          <div className="mb-2">
                            <RecordSegments<MetricKey>
                              segments={available.map((m) => ({ key: m.key, label: m.label }))}
                              active={chosen.key}
                              onChange={setMetric}
                            />
                          </div>
                          <ValdTrendChart points={points} unit={chosen.unit} label={chosen.label} decimals={chosen.decimals} />
                          <table className="mt-3 w-full text-sm">
                            <thead className="text-left">
                              <tr className="border-b border-black/10 dark:border-white/10">
                                <th className={TH}>Date</th>
                                <th className={`${TH} text-right`}>Left ({chosen.unit})</th>
                                <th className={`${TH} text-right`}>Right ({chosen.unit})</th>
                                <th className={`${TH} text-right`}>Diff</th>
                                <th className={`${TH} text-right`}>{rom ? "Of normal" : "Muscle age"}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...open.tests].reverse().map((x) => (
                                <tr key={x.id} className="border-b border-black/[0.05] last:border-0 dark:border-white/[0.05]">
                                  <td className={TD}>{testDate(x.testedAt)}</td>
                                  <td className={`${TD} text-right`}>{fmt(chosen.of(x.sides?.left ?? null), chosen.decimals)}</td>
                                  <td className={`${TD} text-right`}>{fmt(chosen.of(x.sides?.right ?? null), chosen.decimals)}</td>
                                  <td className={`${TD} text-right`}>{x.asymmetryPercent == null ? "—" : `${Math.abs(x.asymmetryPercent).toFixed(1)}%`}</td>
                                  <td className={`${TD} text-right`}>
                                    {rom
                                      ? x.romPercentOfNormal != null ? `${Math.round(x.romPercentOfNormal)}%` : "—"
                                      : x.muscleAge != null ? `${Math.round(x.muscleAge)} yrs` : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

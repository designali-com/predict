"use client"
import { Button } from "@workspace/ui/components/button"

import React, { useEffect, useMemo, useState } from "react"
import { PredictSpinner } from "@/src/components/predict-loader"
import { Badge } from "@workspace/ui/components/badge"
import { BiomarkerCard } from "@workspace/ui/components/predict/biomarker-card"
import { DottedScroll } from "@/src/components/dashboard/user/dotted-scroll"
import {
  UNMEASURED_COLOR,
  cleanName,
  domainBlurb,
  formatValue,
  referenceRange,
  severityColor,
  type DashboardDomain,
  type PatientDashboard,
} from "@/src/components/dashboard/user/dashboard-data"

/**
 * The domain flower: one petal per domain of the patient's index.
 *
 * Was seven hard-coded domains with invented scores and a "58 Health Index"
 * in the middle that nothing calculated. Now every petal is a domain from
 * the patient's own saved result: its length is the domain's Mean |Z| — how
 * far its markers sit from the middle of their healthy range, the same figure
 * the biological clock is built from — and its colour is the domain's
 * severity band. A domain nobody tested is drawn small and grey, never given
 * a score it does not have. The centre is the biological age itself.
 */

const SIZE = 600
const C = SIZE / 2

function polar(radius: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180
  return { x: C + radius * Math.cos(rad), y: C + radius * Math.sin(rad) }
}

/**
 * A point on a leaf, in the leaf's own terms: `along` outward from the
 * centre, `side` across it (negative left). Turned to the leaf's angle.
 */
function leafPoint(angle: number, along: number, side: number) {
  const a = (angle * Math.PI) / 180
  return {
    x: C + along * Math.sin(a) + side * Math.cos(a),
    y: C - along * Math.cos(a) + side * Math.sin(a),
  }
}

const LEAF_BASE = 30

/** Half the leaf's width at its widest — wide enough to overlap its neighbours. */
function leafWidth(length: number, spread: number) {
  // About half as wide as long, like a rose leaf — still wide enough at its
  // broadest to cross over the leaves either side.
  return length * (spread / 165)
}

/**
 * A rose leaf: a narrow stalk-like base that does not flare straight out of
 * the centre, widening gently to its broadest a little past halfway, then
 * drawing in to a pointed tip.
 */
function leafPath(angle: number, length: number, spread: number) {
  const w = leafWidth(length, spread)
  const L = length
  const p = (along: number, side: number) => {
    const q = leafPoint(angle, along, side)
    return `${q.x} ${q.y}`
  }
  return `M ${p(LEAF_BASE, -2)}
    C ${p(L * 0.2, -w * 0.28)}, ${p(L * 0.3, -w * 0.95)}, ${p(L * 0.52, -w)}
    C ${p(L * 0.72, -w * 1.02)}, ${p(L * 0.9, -w * 0.45)}, ${p(L, 0)}
    C ${p(L * 0.9, w * 0.45)}, ${p(L * 0.72, w * 1.02)}, ${p(L * 0.52, w)}
    C ${p(L * 0.3, w * 0.95)}, ${p(L * 0.2, w * 0.28)}, ${p(LEAF_BASE, 2)} Z`
}

/** The midrib and three pairs of side veins angled toward the tip. */
function leafVeins(angle: number, length: number, spread: number) {
  const w = leafWidth(length, spread)
  const L = length
  const p = (along: number, side: number) => {
    const q = leafPoint(angle, along, side)
    return `${q.x} ${q.y}`
  }
  const pairs = [0.34, 0.5, 0.66].flatMap((t) => {
    const reach = w * (t < 0.6 ? 0.72 : 0.58)
    return [
      `M ${p(L * t, 0)} Q ${p(L * (t + 0.06), -reach * 0.5)}, ${p(L * (t + 0.13), -reach)}`,
      `M ${p(L * t, 0)} Q ${p(L * (t + 0.06), reach * 0.5)}, ${p(L * (t + 0.13), reach)}`,
    ]
  })
  return { midrib: `M ${p(LEAF_BASE, 0)} L ${p(L * 0.9, 0)}`, sides: pairs.join(" ") }
}

const MIN_R = 155
const MAX_R = 240
const UNMEASURED_R = 140

export default function BiologicalAgePage() {
  const [data, setData] = useState<PatientDashboard | null>(null)
  const [failed, setFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch("/api/patient/dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: PatientDashboard) => live && setData(d))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  const index = data?.indexes[0] ?? null
  const domains = index?.domains ?? []

  // Petal lengths, scaled across this patient's own measured domains.
  const radiusOf = useMemo(() => {
    const scores = domains.filter((d) => d.measured).map((d) => d.meanAbsZ ?? 0)
    const lo = Math.min(...scores)
    const hi = Math.max(...scores)
    return (d: DashboardDomain) => {
      if (!d.measured) return UNMEASURED_R
      if (!(hi > lo)) return (MIN_R + MAX_R) / 2
      return MIN_R + (((d.meanAbsZ ?? 0) - lo) / (hi - lo)) * (MAX_R - MIN_R)
    }
  }, [domains])

  // Opens on the domain doing most to the age gap.
  const selected = useMemo(() => {
    if (!domains.length) return null
    const chosen = domains.find((d) => d.id === selectedId)
    if (chosen) return chosen
    return [...domains]
      .filter((d) => d.measured)
      .sort((a, b) => (b.shareOfDelta ?? 0) - (a.shareOfDelta ?? 0))[0] ?? domains[0]!
  }, [domains, selectedId])

  if (!data && !failed) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-2rem)] items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  if (failed || !data) {
    return (
      <p className="m-4 rounded-md border p-8 text-center text-sm text-muted-foreground">
        Couldn&apos;t load your results. Refresh the page, or contact the clinic if it keeps happening.
      </p>
    )
  }

  if (!index || !selected) {
    return (
      <div className="m-4 rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm font-medium">No biological age result yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          Once your clinic records a blood report, your domains appear here as a flower — one petal for each
          body system.
        </p>
      </div>
    )
  }

  const colorOf = (d: DashboardDomain) => (d.measured ? severityColor(d.severity) : UNMEASURED_COLOR)
  const step = 360 / domains.length
  const angleOf = (i: number) => i * step
  const selectedColor = colorOf(selected)
  const share = Math.round((selected.shareOfDelta ?? 0) * 100)

  return (
    <main className="relative w-full">
      {/* The page heading, as on Biomarker Overview. */}
      <div className="max-w-3xl px-4 pt-4 md:px-6 md:pt-6">
        <h1 className="text-xl font-medium tracking-tight md:text-2xl">Biological Age</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          How far each body system has moved your age, from your latest blood report. Tap a petal to see the markers behind it.
        </p>
      </div>
      {/* On a desktop both cards are exactly the screen's height, so the
          page itself never scrolls: the flower fits itself to what is left,
          and the markers scroll inside their own card. On a phone the page
          simply runs on. */}
      <div className="relative grid w-full gap-4 p-4 md:gap-6 md:p-6 lg:h-[calc(100svh-var(--header-height)-1.2rem-6rem)] lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* THE FLOWER */}
        <section className="relative flex h-fit flex-col items-center rounded-3xl border p-4 md:p-6 lg:h-full lg:min-h-0">
          <div className="flex w-full items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold md:text-2xl">Domain Flower</h2>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground md:text-sm">
                One petal per body system. The longer the petal, the further its markers sit from their healthy
                range. Tap a petal to see its markers.
              </p>
            </div>
            <div className="hidden shrink-0 text-right sm:block">
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Active domain
              </span>
              <p className="text-sm font-semibold" style={{ color: selectedColor }}>
                {cleanName(selected.name, selected.shortCode)}
              </p>
            </div>
          </div>

          <div className="my-4 flex w-full justify-center md:my-6 lg:min-h-0 lg:flex-1 lg:items-center">
          <div className="relative aspect-square w-full max-w-[560px] lg:h-full lg:w-auto lg:max-w-full">
            <div
              className="pointer-events-none absolute top-1/2 left-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[110px] transition-all duration-700 md:h-72 md:w-72"
              style={{ background: selectedColor, opacity: 0.2 }}
            />

            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full overflow-visible">
              <defs>
                {domains.map((d) => (
                  <radialGradient key={d.id} id={`petal-${d.id}`} cx="50%" cy="85%" r="85%">
                    <stop offset="0%" stopColor={colorOf(d)} stopOpacity={d.measured ? 0.9 : 0.35} />
                    <stop offset="60%" stopColor={colorOf(d)} stopOpacity={d.measured ? 0.65 : 0.2} />
                    <stop offset="100%" stopColor="#02060c" stopOpacity="0.2" />
                  </radialGradient>
                ))}
                <radialGradient id="pistilGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#c4a1ff" stopOpacity="0.7" />
                  <stop offset="60%" stopColor="#8504FE" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#8504FE" stopOpacity="0" />
                </radialGradient>
                <filter id="petalShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="6" stdDeviation="8" floodOpacity="0.15" />
                </filter>
              </defs>

              {[255, 205, 155].map((r) => (
                <circle
                  key={r}
                  cx={C}
                  cy={C}
                  r={r}
                  fill="none"
                  className="stroke-zinc-300/50 dark:stroke-white/[0.05]"
                  strokeDasharray="3 6"
                />
              ))}

              {domains.map((d, i) => {
                const isSelected = d.id === selected.id
                const radius = radiusOf(d)
                // The original leaf: wide enough that its belly swells out
                // past both sides and overlaps its neighbours — a flower,
                // not a fan of separate blades. Worse domains swell a little
                // more, as the design had it.
                const spread = 38 + (d.measured ? Math.min(d.meanAbsZ ?? 0, 3) : 0) * 2.8
                const angle = angleOf(i)
                const length = isSelected ? radius + 12 : radius
                const path = leafPath(angle, length, spread)
                const color = colorOf(d)
                const veins = leafVeins(angle, length, spread)

                return (
                  <g
                    key={d.id}
                    role="button"
                    aria-label={cleanName(d.name, d.shortCode)}
                    onClick={() => setSelectedId(d.id)}
                    className="cursor-pointer transition-all duration-500 ease-out"
                    style={{ transformOrigin: `${C}px ${C}px`, transform: isSelected ? "scale(1.03)" : "scale(1)" }}
                  >
                    {isSelected && <path d={path} fill={color} opacity="0.25" className="blur-md" />}
                    <path
                      d={path}
                      fill={`url(#petal-${d.id})`}
                      filter="url(#petalShadow)"
                      stroke={color}
                      strokeWidth={isSelected ? 2 : 0.8}
                      strokeOpacity={isSelected ? 0.9 : 0.4}
                      strokeDasharray={d.measured ? undefined : "4 4"}
                    />
                    <path
                      d={veins.midrib}
                      stroke="#ffffff"
                      strokeWidth={isSelected ? 1.5 : 1}
                      strokeOpacity={isSelected ? 0.5 : 0.2}
                      strokeLinecap="round"
                      fill="none"
                      className="pointer-events-none"
                    />
                    <path
                      d={veins.sides}
                      stroke="#ffffff"
                      strokeWidth="0.75"
                      strokeOpacity={isSelected ? 0.35 : 0.12}
                      strokeLinecap="round"
                      fill="none"
                      className="pointer-events-none"
                    />
                  </g>
                )
              })}

              <circle cx={C} cy={C} r="76" fill="url(#pistilGlow)" />
              <circle
                cx={C}
                cy={C}
                r="46"
                className="fill-white stroke-primary/30 dark:fill-[#02060c]"
                strokeWidth="1.5"
              />
            </svg>

            {/* CENTRE: the biological age */}
            <div className="absolute top-1/2 left-1/2 z-30 flex aspect-square w-[20%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/30 bg-white/90 shadow-xl backdrop-blur-md dark:bg-[#02060c]/90">
              <div className="text-center">
                <div className="text-lg font-bold leading-none tracking-tight sm:text-2xl md:text-3xl">
                  {Math.round(index.biologicalAge)}
                </div>
                {/* Shortened on a phone, where the full label ran out of the circle. */}
                <div className="mt-0.5 text-[7px] font-semibold uppercase tracking-wider text-primary sm:text-[8px] md:text-[9px]">
                  <span className="sm:hidden">Bio age</span>
                  <span className="hidden sm:inline">Biological age</span>
                </div>
              </div>
            </div>

            {/* LABELS */}
            {domains.map((d, i) => {
              const labelRadius = Math.max(262, radiusOf(d) + 34)
              const point = polar(labelRadius, angleOf(i))
              const active = d.id === selected.id
              return (
                <Button variant="ghost" size="default"
 key={d.id}
 type="button"
 onClick={() => setSelectedId(d.id)}
 className="absolute z-40 -translate-x-1/2 -translate-y-1/2 text-center transition-transform duration-300 hover:scale-110 h-auto whitespace-normal"
 style={{ left: `${(point.x / SIZE) * 100}%`, top: `${(point.y / SIZE) * 100}%` }}
 >
                  <div
                    className="text-[9px] font-bold uppercase tracking-wider md:text-[11px]"
                    style={{ color: colorOf(d), opacity: active ? 1 : 0.85 }}
                  >
                    {d.shortCode}
                  </div>
                  <div
                    className={`mt-0.5 text-xs font-bold md:text-sm ${
                      active ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {d.measured ? formatValue(Number((d.meanAbsZ ?? 0).toFixed(2))) : "—"}
                  </div>
                </Button>
              )
            })}
          </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            Petal values are Mean |Z|. Dashed grey petals are domains not measured yet.
          </p>
        </section>

        {/* THE SELECTED DOMAIN */}
        <section className="flex h-fit flex-col rounded-3xl border p-4 md:p-6 lg:h-full lg:min-h-0">
          <h3 className="text-xl font-medium md:text-2xl">{cleanName(selected.name, selected.shortCode)}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {domainBlurb(selected) ?? "No description has been set for this domain."}
          </p>

          {selected.measured ? (
            <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl border p-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Mean |Z|</div>
                <div className="mt-1 text-xl font-bold" style={{ color: selectedColor }}>
                  {(selected.meanAbsZ ?? 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Severity</div>
                <div className="mt-1 text-sm font-semibold capitalize" style={{ color: selectedColor }}>
                  {selected.band?.label ?? selected.severity}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Of age gap</div>
                <div className="mt-1 text-xl font-bold">{share}%</div>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed p-4">
              <p className="text-sm font-medium">Not measured yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                None of this domain&apos;s markers were on your report, so it is left out of your biological age.
              </p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <span className="text-sm font-medium">Your markers</span>
            <Badge variant="secondary">{selected.biomarkers.length} measured</Badge>
          </div>

          {/* The markers scroll inside the card on a desktop, with the same
              dotted bar as the dashboard; the name and scores above stay put. */}
          <DottedScroll
            key={selected.id}
            wrapperClassName="mt-3 lg:min-h-0 lg:flex-1"
            className="lg:h-full lg:overflow-y-auto lg:pr-5"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {selected.biomarkers.map((b) => (
                <BiomarkerCard
                  key={b.id}
                  name={b.shortCode}
                  fullname={b.name}
                  value={`${formatValue(b.value)}${b.unit ? ` ${b.unit}` : ""}`}
                  status={b.status}
                  referenceRange={referenceRange(b)}
                />
              ))}
            </div>

            {selected.missing.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2 pb-1">
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Not yet tested</span>
                {selected.missing.map((code) => (
                  <Badge key={code} variant="outline" className="rounded-full px-3 py-1 font-normal">
                    {code}
                  </Badge>
                ))}
              </div>
            )}
          </DottedScroll>
        </section>
      </div>
    </main>
  )
}

"use client"

import React from "react"
import { BioClock } from "@workspace/ui/components/predict/bio-clock"
import {
  age,
  measuredDomains,
  severityColor,
  type DashboardIndex,
} from "./dashboard-data"

export interface RiskGaugeProps {
  /** Null until a panel has been run — the clock then shows nothing. */
  index?: DashboardIndex | null
  /** Sizes the clock alone, leaving the text and legend under it full width. */
  clockClassName?: string
}

/**
 * The biological clock, drawn from one saved result.
 *
 * Three needles, three real quantities: the outer ring is the domains that
 * were actually measured (the longest arc is the one driving the age), the
 * inner ring is the composite score on the same 0–5 scale the severity bands
 * use, and the age hand is the biological age itself.
 *
 * Domains with no readings are not drawn. They would be indistinguishable
 * from a domain that came back clean, which is the opposite of what an empty
 * one means.
 */
function RiskGaugeImpl({ index, clockClassName }: RiskGaugeProps) {
  const measured = index ? measuredDomains(index) : []

  if (!index || measured.length === 0) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium">No biological age result yet</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Once a blood panel is recorded against your chart, your clock is calculated and shown here.
        </p>
      </div>
    )
  }

  const domains = measured.map((d) => ({
    label: d.shortCode,
    color: severityColor(d.severity),
    // The arc length is this domain's share of the ΔAge, so the longest arc
    // is literally what is ageing this patient most.
    value: Math.round((d.shareOfDelta ?? 0) * 100),
  }))

  const olderOrYounger = index.deltaAge >= 0 ? "older" : "younger"
  const years = Math.round(Math.abs(index.deltaAge))

  // The gap the hand is pointing at, signed: "+10 Years", "−3 Years".
  const gap = `${index.deltaAge >= 0 ? "+" : "−"}${years} Year${years === 1 ? "" : "s"}`

  // What each hand is pointing at, for the legend on a phone — the same
  // picks the clock makes: the second hand goes to the first domain with the
  // biggest rounded share.
  const top = domains.reduce((best, d, i) => (d.value > domains[best]!.value ? i : best), 0)
  const readings = {
    hour: `${index.biologicalAge.toFixed(2)} (${index.deltaAge >= 0 ? "+" : "−"}${years})`,
    minute: index.compositeScore.toFixed(2),
    second: `${domains[top]!.label} · ${domains[top]!.value}%`,
  }
  // Only on a phone: there each legend row has the width of the screen and
  // nothing on its right. From md up the three sit side by side, narrow.
  const reading = (text: string) => (
    <span className="ml-auto shrink-0 pl-2 text-right font-mono text-sm font-medium text-foreground md:hidden">
      {text}
    </span>
  )

  return (
    <div className="flex w-full flex-col gap-4 overflow-hidden text-dashboard-text">
      <div className="flex flex-col items-center justify-center">
        <BioClock
          domains={domains}
          currentValue={index.compositeScore}
          bioAge={index.biologicalAge}
          yearsValue={gap}
          className={clockClassName}
        />

        <p className="text-center text-xs text-gray-400 md:text-sm">
          {years === 0 ? (
            <>
              Your biological age is{" "}
              <span className="text-foreground">the same as your actual age</span> ({age(index.chronologicalAge)}).
            </>
          ) : (
            <>
              Your biological age is{" "}
              <span className="text-foreground">
                {years} year{years === 1 ? "" : "s"} {olderOrYounger}
              </span>{" "}
              than your actual age — {age(index.biologicalAge)} against {age(index.chronologicalAge)}.
            </>
          )}
        </p>

        <p className="pt-1 text-center text-[11px] text-muted-foreground">
          Calculated from {index.measuredDomains} of {index.mappedDomains} domains
        </p>
      </div>

      <div className="h-[1px] w-full bg-foreground/10" />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-2 rounded-full bg-foreground" />
          <div className="flex flex-col">
            <h4 className="text-[10px] uppercase tracking-wider text-foreground">Hour Hand</h4>
            <p className="text-[11px] text-gray-500">How sick or unwell you are</p>
          </div>
          {reading(readings.hour)}
        </div>

        <div className="flex items-center gap-3">
          <div className="h-11 w-2 rounded-full bg-foreground" />
          <div className="flex flex-col">
            <h4 className="text-[10px] uppercase tracking-wider text-foreground">Minute Hand</h4>
            <p className="text-[11px] text-gray-500">How fast your body is aging</p>
          </div>
          {reading(readings.minute)}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-11 flex-col justify-between">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-2 w-2 rounded-full bg-foreground/80" />
            ))}
          </div>
          <div className="flex flex-col">
            <h4 className="text-[10px] uppercase tracking-wider text-foreground">Second Hand</h4>
            <p className="text-[11px] text-gray-500">What&apos;s causing the problem</p>
          </div>
          {reading(readings.second)}
        </div>
      </div>
    </div>
  )
}

export const RiskGauge = React.memo(RiskGaugeImpl)

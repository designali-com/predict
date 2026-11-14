"use client"

import React from "react"
import {
  severityColor,
  type DashboardBiomarker,
} from "./dashboard-data"

export interface HealthScoreProps {
  /** Latest reading per marker, already sorted worst-first. */
  biomarkers: DashboardBiomarker[]
  inRange: number
  measured: number
  lastPanelOn?: string | null
  className?: string
}

/**
 * How much of this patient's panel is actually inside its reference range.
 *
 * Was a "Health Score" of 24 over a grid of twenty-eight fixed coloured
 * pills — a number with no source and a picture with no data. There is no
 * health score column anywhere in the system, so rather than invent one this
 * counts something real: one pill per measured marker, coloured by how far
 * that marker sits from its range, and a headline of in-range over measured.
 *
 * A patient can check it against their own lab sheet, which is the whole
 * test of whether a number on this page belongs here.
 */
function HealthScoreImpl({
  biomarkers,
  inRange,
  measured,
  lastPanelOn,
  className = "",
}: HealthScoreProps) {
  const scored = biomarkers.filter((b) => b.status !== "Unknown")

  return (
    <div className={`flex items-stretch ${className}`}>
      <div className="flex h-full w-full min-w-60 shrink-0 flex-col items-center justify-between rounded-xl border p-4">
        <div className="flex w-full items-baseline justify-between gap-3">
          <span className="text-xl font-medium leading-none tracking-tight">
            {measured === 0 ? "—" : `${inRange}/${measured}`}
          </span>
          <span className="text-sm font-normal leading-none text-muted-foreground">
            markers in range
          </span>
        </div>

        {measured === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No blood test recorded yet.
          </p>
        ) : (
          // On a phone, one row across the full width of the card, each pill
          // an equal share of it — the fixed seven-column grid left gaps at
          // both sides and broke eleven markers over two lines. From md up
          // the card is narrow and beside the age bar, so the grid returns.
          <div
            className="flex w-full gap-[3px] pt-3 md:grid md:w-auto md:grid-cols-7 md:gap-[4px]"
            aria-label={`${inRange} of ${measured} measured biomarkers are inside their reference range`}
          >
            {scored.map((b) => (
              <span
                key={b.id}
                title={`${b.shortCode}: ${b.status}`}
                className="h-3 min-w-0 flex-1 rounded-full shadow-[inset_0_6px_6px_rgba(255,255,255,0.4),inset_0_-2px_8px_rgba(255,255,255,0.2)] transition-colors duration-300 md:w-6 md:flex-none"
                style={{ backgroundColor: severityColor(b.severity) }}
              />
            ))}
          </div>
        )}

        <p className="w-full pt-3 text-[11px] text-muted-foreground">
          {lastPanelOn
            ? `From your panel of ${new Date(lastPanelOn).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}.`
            : "One pill per marker, coloured by how far it sits from its range."}
        </p>
      </div>
    </div>
  )
}

export const HealthScore = React.memo(HealthScoreImpl)

"use client"

import { BioClock, type SeverityScale } from "@workspace/ui/predict/bio-clock"

const severity: SeverityScale = {
  ranges: [
    { min: 0, max: 4, color: "var(--color-status-normal)" },
    { min: 4, max: 7, color: "var(--color-status-mild)" },
    { min: 7, max: 10, color: "var(--color-status-extreme)" },
  ],
  current: 6.5,
}

export function BioClockSeverity() {
  return (
    <div className="mx-auto flex flex-wrap items-center justify-center gap-3">
      <BioClock severity={severity} bioAge={47} yearsValue="+2 Years" />
    </div>
  )
}

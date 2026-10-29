"use client"

import { BioClock, type DomainSegment } from "@workspace/ui/predict/bio-clock"

const domains: DomainSegment[] = [
  { label: "HRT", fullName: "Heart health", color: "var(--color-status-normal)", value: 80 },
  { label: "MET", fullName: "Metabolic health", color: "var(--color-status-mild)", value: 60 },
  { label: "INF", fullName: "Inflammation", color: "var(--color-status-moderate)", value: 45 },
  { label: "HRM", fullName: "Hormones", color: "var(--color-status-normal)", value: 70 },
  { label: "KID", fullName: "Kidney function", color: "var(--color-status-severe)", value: 30 },
]

export function BioClockDomains() {
  return (
    <div className="mx-auto flex flex-wrap items-center justify-center gap-3">
      <BioClock domains={domains} bioAge={51} yearsValue="+4 Years" currentValue={2.4} />
    </div>
  )
}

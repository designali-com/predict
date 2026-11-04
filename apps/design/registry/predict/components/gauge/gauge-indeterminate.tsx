"use client"

import { GaugeCombined } from "@workspace/ui/components/gauge"

export function GaugeIndeterminate() {
  return <GaugeCombined value={null} aria-label="Waiting for results" />
}

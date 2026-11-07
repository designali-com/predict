"use client"

import {
  Gauge,
  GaugeIndicator,
  GaugeLabel,
  GaugeRange,
  GaugeTrack,
  GaugeValueText,
} from "@workspace/ui/components/gauge"

export function GaugeWithLabel() {
  return (
    <Gauge value={84} size={160} thickness={10} gap={14} className="gap-3">
      <div className="relative">
        <GaugeIndicator>
          <GaugeTrack />
          <GaugeRange />
        </GaugeIndicator>
        <GaugeValueText />
      </div>
      <GaugeLabel>Sleep quality</GaugeLabel>
    </Gauge>
  )
}

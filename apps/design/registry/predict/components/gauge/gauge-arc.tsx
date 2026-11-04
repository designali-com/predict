"use client"

import {
  Gauge,
  GaugeIndicator,
  GaugeRange,
  GaugeTrack,
  GaugeValueText,
} from "@workspace/ui/components/gauge"

export function GaugeArc() {
  return (
    <Gauge
      value={58}
      startAngle={-120}
      endAngle={120}
      segments={40}
      aria-label="Recovery"
    >
      <GaugeIndicator>
        <GaugeTrack />
        <GaugeRange />
      </GaugeIndicator>
      <GaugeValueText />
    </Gauge>
  )
}

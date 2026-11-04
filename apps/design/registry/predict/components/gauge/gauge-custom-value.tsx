"use client"

import {
  Gauge,
  GaugeIndicator,
  GaugeRange,
  GaugeTrack,
  GaugeValueText,
} from "@workspace/ui/components/gauge"

export function GaugeCustomValue() {
  return (
    <Gauge
      value={38}
      min={18}
      max={90}
      getValueText={(value) => `${value} years`}
      aria-label="Biological age"
    >
      <GaugeIndicator>
        <GaugeTrack />
        <GaugeRange className="text-chart-2" />
      </GaugeIndicator>
      <GaugeValueText className="flex-col gap-0.5">
        <span className="text-3xl font-medium">38</span>
        <span className="text-xs text-muted-foreground">Biological age</span>
      </GaugeValueText>
    </Gauge>
  )
}

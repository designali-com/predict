"use client"

import {
  CircularProgress,
  CircularProgressIndicator,
  CircularProgressRange,
  CircularProgressTrack,
  CircularProgressValueText,
} from "@workspace/ui/components/circular-progress"

export function CircularProgressCustomValue() {
  return (
    <CircularProgress
      value={7}
      max={12}
      size={96}
      thickness={6}
      getValueText={(value, _min, max) => `${value} of ${max} markers`}
      aria-label="Markers processed"
    >
      <CircularProgressIndicator>
        <CircularProgressTrack />
        <CircularProgressRange className="text-chart-2" />
      </CircularProgressIndicator>
      <CircularProgressValueText className="flex-col gap-0.5">
        <span className="text-lg font-semibold tabular-nums">7/12</span>
        <span className="text-[10px] text-muted-foreground">markers</span>
      </CircularProgressValueText>
    </CircularProgress>
  )
}

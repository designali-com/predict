"use client"

import {
  CompareSlider,
  CompareSliderAfter,
  CompareSliderBefore,
  CompareSliderHandle,
} from "@workspace/ui/components/compare-slider"

export function CompareSliderVertical() {
  return (
    <div className="h-72 w-full max-w-xs">
      <CompareSlider
        orientation="vertical"
        className="w-full rounded-lg border"
        aria-label="Compare sleep before and after"
      >
        <CompareSliderBefore label="Before">
          <div className="flex size-full flex-col items-center justify-center gap-1 bg-muted">
            <span className="text-4xl font-semibold tabular-nums">5h 40m</span>
            <span className="text-sm text-muted-foreground">Average sleep</span>
          </div>
        </CompareSliderBefore>
        <CompareSliderAfter label="After">
          <div className="flex size-full flex-col items-center justify-center gap-1 bg-secondary text-secondary-foreground">
            <span className="text-4xl font-semibold tabular-nums">7h 25m</span>
            <span className="text-sm opacity-80">Average sleep</span>
          </div>
        </CompareSliderAfter>
        <CompareSliderHandle />
      </CompareSlider>
    </div>
  )
}

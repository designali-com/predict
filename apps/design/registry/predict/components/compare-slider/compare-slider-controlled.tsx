"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  CompareSlider,
  CompareSliderAfter,
  CompareSliderBefore,
  CompareSliderHandle,
} from "@workspace/ui/components/compare-slider"

export function CompareSliderControlled() {
  const [value, setValue] = React.useState(50)

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <CompareSlider
        value={value}
        onValueChange={setValue}
        className="h-56 w-full rounded-lg border"
        aria-label="Compare HbA1c before and after"
      >
        <CompareSliderBefore label="Before">
          <div className="flex size-full flex-col items-center justify-center gap-1 bg-muted">
            <span className="text-4xl font-semibold tabular-nums">6.1%</span>
            <span className="text-sm text-muted-foreground">HbA1c</span>
          </div>
        </CompareSliderBefore>
        <CompareSliderAfter label="After">
          <div className="flex size-full flex-col items-center justify-center gap-1 bg-primary text-primary-foreground">
            <span className="text-4xl font-semibold tabular-nums">5.4%</span>
            <span className="text-sm opacity-80">HbA1c</span>
          </div>
        </CompareSliderAfter>
        <CompareSliderHandle />
      </CompareSlider>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground tabular-nums">
          {Math.round(value)}%
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setValue(0)}>
            After
          </Button>
          <Button variant="outline" size="sm" onClick={() => setValue(50)}>
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={() => setValue(100)}>
            Before
          </Button>
        </div>
      </div>
    </div>
  )
}

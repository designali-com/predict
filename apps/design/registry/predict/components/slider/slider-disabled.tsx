"use client"

import * as React from "react"

import { Slider } from "@workspace/ui/components/slider"

export function SliderDisabled() {
  const labelId = React.useId()

  return (
    <div className="grid w-full max-w-sm gap-3">
      <span id={labelId} className="text-xs font-medium text-muted-foreground">
        Reminder volume
      </span>
      <Slider aria-labelledby={labelId} defaultValue={[40]} disabled />
    </div>
  )
}

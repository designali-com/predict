"use client"

import * as React from "react"

import { Slider } from "@workspace/ui/components/slider"

export function SliderRange() {
  const labelId = React.useId()

  return (
    <div className="grid w-full max-w-sm gap-3">
      <span id={labelId} className="text-xs font-medium">
        Target glucose range
      </span>
      <Slider aria-labelledby={labelId} defaultValue={[70, 100]} min={40} max={200} />
    </div>
  )
}

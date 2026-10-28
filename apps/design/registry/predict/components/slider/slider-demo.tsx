"use client"

import * as React from "react"

import { Slider } from "@workspace/ui/components/slider"

export function SliderDemo() {
  const [sleep, setSleep] = React.useState(7)

  return (
    <div className="grid w-full max-w-sm gap-3">
      <div className="flex justify-between text-xs">
        <span className="font-medium">Average sleep</span>
        <span className="text-muted-foreground tabular-nums">{sleep} h</span>
      </div>
      <Slider
        aria-label="Average sleep"
        value={[sleep]}
        onValueChange={(value) => setSleep(Array.isArray(value) ? value[0]! : value)}
        min={3}
        max={12}
        step={0.5}
      />
    </div>
  )
}

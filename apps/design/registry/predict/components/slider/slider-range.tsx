"use client"

import { Slider } from "@workspace/ui/components/slider"

export function SliderRange() {
  return (
    <div className="grid w-full max-w-sm gap-3">
      <span className="text-xs font-medium">Target glucose range</span>
      <Slider aria-label="Target glucose range" defaultValue={[70, 100]} min={40} max={200} />
    </div>
  )
}

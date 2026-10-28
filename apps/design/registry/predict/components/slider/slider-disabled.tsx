"use client"

import { Slider } from "@workspace/ui/components/slider"

export function SliderDisabled() {
  return (
    <div className="grid w-full max-w-sm gap-3">
      <span className="text-xs font-medium text-muted-foreground">Disabled</span>
      <Slider aria-label="Disabled" defaultValue={[40]} disabled />
    </div>
  )
}

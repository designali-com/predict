"use client"

import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"

export function RadioGroupDisabled() {
  return (
    <RadioGroup defaultValue="home" aria-label="Collection" className="w-full max-w-xs">
      <label className="flex items-center gap-2 text-xs">
        <RadioGroupItem value="home" />
        Home visit
      </label>
      <label className="flex items-center gap-2 text-xs">
        <RadioGroupItem value="clinic" />
        Clinic
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <RadioGroupItem value="kit" disabled />
        Self-collection kit (unavailable)
      </label>
    </RadioGroup>
  )
}

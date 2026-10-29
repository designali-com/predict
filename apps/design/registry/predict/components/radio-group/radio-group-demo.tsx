"use client"

import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"

export function RadioGroupDemo() {
  return (
    <div className="grid w-full max-w-xs gap-3">
      <p id="exercise-frequency" className="text-xs font-medium">
        How often do you exercise?
      </p>
      <RadioGroup defaultValue="weekly" aria-labelledby="exercise-frequency">
        <label className="flex items-center gap-2 text-xs">
          <RadioGroupItem value="daily" />
          Every day
        </label>
        <label className="flex items-center gap-2 text-xs">
          <RadioGroupItem value="weekly" />
          A few times a week
        </label>
        <label className="flex items-center gap-2 text-xs">
          <RadioGroupItem value="rarely" />
          Rarely
        </label>
      </RadioGroup>
    </div>
  )
}

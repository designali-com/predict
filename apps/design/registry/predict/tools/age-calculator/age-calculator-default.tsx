"use client"

import { AgeCalculator } from "@workspace/ui/tools/age-calculator"

export function AgeCalculatorDefault() {
  return (
    <div className="mx-auto flex w-full justify-center">
      <AgeCalculator
        defaultBirthDate={new Date(2025, 1, 10)}
        defaultMeasuredDate={new Date(2026, 0, 20)}
        defaultGestationalWeeks={32}
      />
    </div>
  )
}

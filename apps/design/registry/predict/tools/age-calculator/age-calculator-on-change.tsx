"use client"

import * as React from "react"

import {
  AgeCalculator,
  type AgeResult,
} from "@workspace/ui/tools/age-calculator"

export function AgeCalculatorOnChange() {
  const [result, setResult] = React.useState<AgeResult | null>(null)

  return (
    <div className="mx-auto flex w-full flex-col items-center gap-3">
      <AgeCalculator
        defaultBirthDate={new Date(2025, 1, 10)}
        defaultMeasuredDate={new Date(2026, 0, 20)}
        onChange={setResult}
      />
      <p className="text-xs text-muted-foreground">
        {result
          ? `onChange: ${result.ageMonths.toFixed(2)} months, ${result.completedYears} completed years`
          : "onChange: null"}
      </p>
    </div>
  )
}

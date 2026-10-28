"use client"

import * as React from "react"

import { Input } from "@workspace/ui/components/input"
import { ReferenceRange } from "@workspace/ui/tools/reference-range"

export function ReferenceRangeInteractive() {
  const [value, setValue] = React.useState(4.2)

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
      <Input
        type="number"
        step={0.1}
        aria-label="Potassium in mmol/L"
        value={Number.isNaN(value) ? "" : value}
        onChange={(event) => setValue(event.target.valueAsNumber)}
      />
      <ReferenceRange
        name="Potassium"
        value={value}
        unit="mmol/L"
        decimals={1}
        range={{ low: 3.5, high: 5.1, criticalLow: 2.8, criticalHigh: 6.2 }}
      />
    </div>
  )
}

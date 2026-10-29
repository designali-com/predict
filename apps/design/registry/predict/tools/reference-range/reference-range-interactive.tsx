"use client"

import * as React from "react"

import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "@workspace/ui/components/number-field"
import { ReferenceRange } from "@workspace/ui/tools/reference-range"

export function ReferenceRangeInteractive() {
  const [value, setValue] = React.useState<number | null>(4.2)

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
      <NumberField
        value={value}
        onValueChange={setValue}
        step={0.1}
        format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
      >
        <NumberFieldScrubArea label="Potassium (mmol/L)" />
        <NumberFieldGroup>
          <NumberFieldDecrement />
          <NumberFieldInput />
          <NumberFieldIncrement />
        </NumberFieldGroup>
      </NumberField>
      <ReferenceRange
        name="Potassium"
        value={value ?? Number.NaN}
        unit="mmol/L"
        decimals={1}
        range={{ low: 3.5, high: 5.1, criticalLow: 2.8, criticalHigh: 6.2 }}
      />
    </div>
  )
}

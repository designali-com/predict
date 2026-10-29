"use client"

import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "@workspace/ui/components/number-field"

export function NumberFieldFormat() {
  return (
    <NumberField
      defaultValue={5.6}
      min={3}
      max={15}
      step={0.1}
      format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
      className="max-w-48"
    >
      <NumberFieldScrubArea label="HbA1c (%)" />
      <NumberFieldGroup>
        <NumberFieldDecrement />
        <NumberFieldInput />
        <NumberFieldIncrement />
      </NumberFieldGroup>
    </NumberField>
  )
}

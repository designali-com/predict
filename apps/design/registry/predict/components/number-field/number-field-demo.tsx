"use client"

import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "@workspace/ui/components/number-field"

export function NumberFieldDemo() {
  return (
    <NumberField defaultValue={70} min={20} max={300} className="max-w-48">
      <NumberFieldScrubArea label="Weight (kg)" />
      <NumberFieldGroup>
        <NumberFieldDecrement />
        <NumberFieldInput />
        <NumberFieldIncrement />
      </NumberFieldGroup>
    </NumberField>
  )
}

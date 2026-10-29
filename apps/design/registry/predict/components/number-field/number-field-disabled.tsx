"use client"

import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "@workspace/ui/components/number-field"

export function NumberFieldDisabled() {
  return (
    <NumberField defaultValue={172} disabled className="max-w-48">
      <NumberFieldScrubArea label="Height (cm)" />
      <NumberFieldGroup>
        <NumberFieldDecrement />
        <NumberFieldInput />
        <NumberFieldIncrement />
      </NumberFieldGroup>
    </NumberField>
  )
}

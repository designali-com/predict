"use client"

import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@workspace/ui/components/number-field"

const sizes = ["sm", "default", "lg"] as const

export function NumberFieldSizes() {
  return (
    <div className="flex w-full max-w-48 flex-col gap-4">
      {sizes.map((size) => (
        <NumberField key={size} size={size} defaultValue={5}>
          <NumberFieldGroup>
            <NumberFieldDecrement />
            <NumberFieldInput aria-label={`Quantity, ${size}`} />
            <NumberFieldIncrement />
          </NumberFieldGroup>
        </NumberField>
      ))}
    </div>
  )
}

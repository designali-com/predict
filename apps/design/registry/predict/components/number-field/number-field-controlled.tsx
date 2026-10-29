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

export function NumberFieldControlled() {
  const [value, setValue] = React.useState<number | null>(8)

  return (
    <div className="flex w-full max-w-48 flex-col gap-3">
      <NumberField value={value} onValueChange={setValue} min={0} max={24}>
        <NumberFieldScrubArea label="Sleep (hours)" />
        <NumberFieldGroup>
          <NumberFieldDecrement />
          <NumberFieldInput />
          <NumberFieldIncrement />
        </NumberFieldGroup>
      </NumberField>
      <p className="text-muted-foreground text-xs">
        Value: {value ?? "empty"}
      </p>
    </div>
  )
}

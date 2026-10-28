"use client"

import { ReferenceRange } from "@workspace/ui/tools/reference-range"

export function ReferenceRangeDemo() {
  return (
    <div className="mx-auto flex w-full justify-center">
      <ReferenceRange
        name="Glucose, fasting"
        value={92}
        unit="mg/dL"
        range={{ low: 70, high: 99 }}
      />
    </div>
  )
}

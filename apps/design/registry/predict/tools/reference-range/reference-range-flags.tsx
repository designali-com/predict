"use client"

import { ReferenceRange } from "@workspace/ui/tools/reference-range"

export function ReferenceRangeFlags() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3 sm:grid-cols-2">
      <ReferenceRange
        name="Haemoglobin"
        value={11.2}
        unit="g/dL"
        decimals={1}
        range={{ low: 12, high: 15.5 }}
      />
      <ReferenceRange
        name="Total cholesterol"
        value={232}
        unit="mg/dL"
        range={{ high: 200 }}
      />
      <ReferenceRange
        name="Potassium"
        value={6.8}
        unit="mmol/L"
        decimals={1}
        range={{ low: 3.5, high: 5.1, criticalLow: 2.8, criticalHigh: 6.2 }}
      />
      <ReferenceRange
        name="Vitamin D"
        value={34}
        unit="ng/mL"
        range={{ low: 30 }}
      />
      <ReferenceRange
        name="Urine protein"
        value="Positive"
        range={{ text: "Negative" }}
        flag="abnormal"
      />
      <ReferenceRange name="Blood group" value="O+" />
    </div>
  )
}

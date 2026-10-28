"use client"

import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Separator } from "@workspace/ui/components/separator"

const markers = [
  "ApoB",
  "LDL-C",
  "HDL-C",
  "Triglycerides",
  "Lp(a)",
  "HbA1c",
  "Fasting glucose",
  "Insulin",
  "hs-CRP",
  "Ferritin",
  "Vitamin D",
  "Vitamin B12",
  "TSH",
  "Free T4",
  "ALT",
  "AST",
  "Creatinine",
  "eGFR",
  "Uric acid",
  "Testosterone",
]

export function ScrollAreaDemo() {
  return (
    <ScrollArea className="h-72 w-56 rounded-md border">
      <div className="p-4">
        <p className="mb-4 text-sm font-medium">Biomarkers</p>
        {markers.map((marker) => (
          <div key={marker}>
            <div className="text-xs">{marker}</div>
            <Separator className="my-2" />
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

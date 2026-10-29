"use client"

import {
  biomarkerRange,
  getBiomarker,
} from "@workspace/ui/lib/biomarkers"
import { ReferenceRange } from "@workspace/ui/tools/reference-range"

// Example results for one panel.
const results = [
  { id: "hs-crp", value: 3.5 },
  { id: "il-6", value: 9.8 },
  { id: "hba1c", value: 7.6 }, 
]

export function BiomarkerGrid() {
  return (
    <section className="flex w-full flex-col gap-3">

      <div className="grid gap-4">
        {results.map(({ id, value }) => {
          const biomarker = getBiomarker(id)!
          return (
            <ReferenceRange
              key={id}
              name={biomarker.abbreviation}
              description={biomarker.name}
              value={value}
              unit={biomarker.unit}
              range={biomarkerRange(biomarker)}
              className="max-w-none"
            />
          )
        })}
      </div>
    </section>
  )
}

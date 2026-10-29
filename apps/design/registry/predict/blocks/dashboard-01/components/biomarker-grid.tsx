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
  { id: "ldl-c", value: 185.5 },
  { id: "vitamin-d", value: 25.4 },
  { id: "egfr", value: 82.7 },
]

export function BiomarkerGrid() {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">Needs attention</h2>
        <p className="text-xs text-muted-foreground">
          Results outside their healthy range, most severe first.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

"use client"

import { biomarkerRange, biomarkers } from "@workspace/ui/lib/biomarkers"
import { ReferenceRange } from "@workspace/ui/tools/reference-range"

// Example results, by biomarker id.
const results: Record<string, number> = {
  "hs-crp": 3.5, crp: 4.2, nlr: 3.2, "il-6": 9.8, "tnf-alpha": 12.7,
  "ck-mm": 190, "aldolase-a": 8.5, "igf-1": 82.8, myostatin: 18.3,
  "mmp-9": 155.8, "ctx-ii": 510.7, pth: 75.3, "ca-p-ratio": 2.9,
  "vitamin-d": 25.4, osteocalcin: 8.9, pinp: 9.7, fbs: 110, fsi: 28.8,
  hba1c: 7.6, "total-cholesterol": 225.6, "ldl-c": 185.5, "hdl-c": 35.7,
  triglycerides: 165.8, bdnf: 12.8, vegf: 305.6, nox: 18.9, ngf: 18.8,
  "substance-p": 225.6, gfap: 125.7, "et-1": 4.6, mda: 4.6,
  "tgf-beta1": 12.7, "timp-1": 55.9, egfr: 82.7, creatinine: 1.8,
  bun: 21.8, "uric-acid": 8.9, urea: 45.6, albumin: 2.8, comp: 850,
}

export function ReferenceRangePanel() {
  return (
    <div className="mx-auto grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {biomarkers.map((biomarker) => (
        <ReferenceRange
          key={biomarker.id}
          name={biomarker.abbreviation}
          description={biomarker.name}
          value={results[biomarker.id] ?? Number.NaN}
          unit={biomarker.unit}
          range={biomarkerRange(biomarker)}
          className="max-w-none"
        />
      ))}
    </div>
  )
}

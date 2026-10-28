"use client"

import { BioClock } from "@workspace/ui/predict/bio-clock"

export function BioClockCustom() {
  return (
    <div className="mx-auto flex flex-wrap items-center justify-center gap-3">
      <BioClock bioAge={42} yearsValue="-3 Years" currentValue={0.6} />
    </div>
  )
}

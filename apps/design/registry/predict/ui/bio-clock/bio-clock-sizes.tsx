"use client"

import { BioClock } from "@workspace/ui/predict/bio-clock"

export function BioClockSizes() {
  return (
    <div className="mx-auto flex flex-wrap items-end justify-center gap-6">
      <BioClock size={240} />
      <BioClock size="sm" />
    </div>
  )
}

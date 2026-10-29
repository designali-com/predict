"use client"

import { PredictMascot } from "@workspace/ui/predict/predict-mascot"

export function MascotSizes() {
  return (
    <div className="flex items-end gap-8">
      <PredictMascot className="size-12" />
      <PredictMascot className="size-20" />
      <PredictMascot className="size-30" />
    </div>
  )
}

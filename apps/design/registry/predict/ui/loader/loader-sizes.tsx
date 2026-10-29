"use client"

import { PredictLoader } from "@workspace/ui/predict/loader"

export function LoaderSizes() {
  return (
    <div className="flex items-end gap-8">
      <PredictLoader size={16} />
      <PredictLoader size={24} />
      <PredictLoader size={40} />
    </div>
  )
}

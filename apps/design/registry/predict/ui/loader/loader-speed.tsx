"use client"

import { PredictLoader } from "@workspace/ui/predict/loader"

const durations = [0.8, 1.4, 2.4]

export function LoaderSpeed() {
  return (
    <div className="flex items-end gap-10">
      {durations.map((duration) => (
        <div key={duration} className="flex flex-col items-center gap-2">
          <PredictLoader size={32} duration={duration} />
          <span className="text-muted-foreground font-mono text-xs">{duration}s</span>
        </div>
      ))}
    </div>
  )
}

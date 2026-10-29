"use client"

import { AgeBar } from "@workspace/ui/predict/age-bar"

export function AgeBarOnPace() {
  return (
    <div className="w-full max-w-xl">
      <AgeBar biologicalAge={45} chronologicalAge={45} />
    </div>
  )
}

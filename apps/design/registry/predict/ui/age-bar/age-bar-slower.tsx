"use client"

import { AgeBar } from "@workspace/ui/predict/age-bar"

export function AgeBarSlower() {
  return (
    <div className="w-full max-w-xl">
      <AgeBar biologicalAge={32} chronologicalAge={40} />
    </div>
  )
}

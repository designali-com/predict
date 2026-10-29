"use client"

import { AgeBar } from "@workspace/ui/predict/age-bar"

export function AgeBarDemo() {
  return (
    <div className="w-full max-w-xl">
      <AgeBar biologicalAge={48} chronologicalAge={38} />
    </div>
  )
}

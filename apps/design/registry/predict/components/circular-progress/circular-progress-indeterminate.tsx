"use client"

import { CircularProgressCombined } from "@workspace/ui/components/circular-progress"

export function CircularProgressIndeterminate() {
  return <CircularProgressCombined value={null} aria-label="Loading" />
}

"use client"

import { Progress } from "@workspace/ui/components/progress"

export function ProgressIndeterminate() {
  return <Progress value={null} aria-label="Uploading" className="w-full max-w-sm" />
}

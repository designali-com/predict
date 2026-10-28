"use client"

import { Progress } from "@workspace/ui/components/progress"

export function ProgressWithoutLabel() {
  return <Progress value={40} aria-label="Profile complete" className="w-full max-w-sm" />
}

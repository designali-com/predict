"use client"

import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@workspace/ui/components/progress"

export function ProgressCustomValue() {
  return (
    <Progress value={4} max={6} className="w-full max-w-sm">
      <ProgressLabel>Onboarding</ProgressLabel>
      <ProgressValue>{() => "4 of 6 steps"}</ProgressValue>
    </Progress>
  )
}

"use client"

import { Checkbox } from "@workspace/ui/components/checkbox"

export function CheckboxDescription() {
  return (
    <label className="flex max-w-xs items-start gap-2 text-xs">
      <Checkbox className="mt-0.5" />
      <span className="grid gap-1">
        <span className="font-medium">Share results with my GP</span>
        <span className="text-muted-foreground">
          Your GP receives a copy of every new report. You can stop this at any
          time.
        </span>
      </span>
    </label>
  )
}

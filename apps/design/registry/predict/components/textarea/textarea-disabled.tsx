"use client"

import { Textarea } from "@workspace/ui/components/textarea"

export function TextareaDisabled() {
  return (
    <label className="grid w-full max-w-sm gap-1.5 text-xs font-medium text-muted-foreground">
      Clinician summary
      <Textarea
        disabled
        defaultValue="Lipids have improved since March. Keep the current plan and retest in 6 months."
      />
    </label>
  )
}

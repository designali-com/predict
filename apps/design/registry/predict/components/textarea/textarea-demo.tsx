"use client"

import { Textarea } from "@workspace/ui/components/textarea"

export function TextareaDemo() {
  return (
    <label className="grid w-full max-w-sm gap-1.5 text-xs font-medium">
      Notes for your clinician
      <Textarea placeholder="Medications, symptoms, or anything we should know before your review." />
    </label>
  )
}

"use client"

import { Textarea } from "@workspace/ui/components/textarea"

export function TextareaInvalid() {
  return (
    <label className="grid w-full max-w-sm gap-1.5 text-xs font-medium">
      Reason for cancelling
      <Textarea aria-invalid placeholder="Tell us why you are cancelling." />
      <span className="font-normal text-destructive">Please add a reason.</span>
    </label>
  )
}

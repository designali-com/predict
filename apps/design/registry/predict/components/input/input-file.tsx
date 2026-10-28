"use client"

import { Input } from "@workspace/ui/components/input"

export function InputFile() {
  return (
    <label className="grid w-full max-w-sm gap-1.5 text-xs font-medium">
      Upload lab report
      <Input type="file" accept="application/pdf" />
    </label>
  )
}

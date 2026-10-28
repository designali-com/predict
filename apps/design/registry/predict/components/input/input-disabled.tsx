"use client"

import { Input } from "@workspace/ui/components/input"

export function InputDisabled() {
  return (
    <label className="grid w-full max-w-sm gap-1.5 text-xs font-medium">
      Member ID
      <Input defaultValue="PRD-20931" disabled />
    </label>
  )
}

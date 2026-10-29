"use client"

import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

export function LabelDisabled() {
  return (
    <div className="flex w-full max-w-xs flex-col-reverse gap-2">
      <Input
        id="label-disabled-id"
        className="peer"
        defaultValue="PRD-20481"
        disabled
      />
      <Label htmlFor="label-disabled-id">Patient ID</Label>
    </div>
  )
}

"use client"

import { Input } from "@workspace/ui/components/input"

export function InputNumber() {
  return (
    <label className="grid w-full max-w-sm gap-1.5 text-xs font-medium">
      Weight (kg)
      <Input type="number" inputMode="decimal" defaultValue={72} />
    </label>
  )
}

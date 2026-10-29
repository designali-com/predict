"use client"

import { Checkbox } from "@workspace/ui/components/checkbox"

export function CheckboxDemo() {
  return (
    <label className="flex items-center gap-2 text-xs">
      <Checkbox defaultChecked />
      I have fasted for at least 8 hours
    </label>
  )
}

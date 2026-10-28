"use client"

import { Switch } from "@workspace/ui/components/switch"

export function SwitchDemo() {
  return (
    <label className="flex w-full max-w-xs items-center justify-between gap-4 text-xs">
      Result notifications
      <Switch defaultChecked />
    </label>
  )
}

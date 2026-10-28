"use client"

import { Switch } from "@workspace/ui/components/switch"

export function SwitchSizes() {
  return (
    <div className="grid w-full max-w-xs gap-4">
      <label className="flex items-center justify-between gap-4 text-xs">
        Default
        <Switch defaultChecked />
      </label>
      <label className="flex items-center justify-between gap-4 text-xs">
        Small
        <Switch size="sm" defaultChecked />
      </label>
    </div>
  )
}

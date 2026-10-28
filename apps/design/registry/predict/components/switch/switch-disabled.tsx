"use client"

import { Switch } from "@workspace/ui/components/switch"

export function SwitchDisabled() {
  return (
    <label className="flex w-full max-w-xs items-center justify-between gap-4 text-xs text-muted-foreground">
      Research programme (closed)
      <Switch disabled />
    </label>
  )
}

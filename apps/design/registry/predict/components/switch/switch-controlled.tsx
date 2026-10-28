"use client"

import * as React from "react"

import { Switch } from "@workspace/ui/components/switch"

export function SwitchControlled() {
  const [shared, setShared] = React.useState(false)

  return (
    <div className="grid w-full max-w-xs gap-2">
      <label className="flex items-center justify-between gap-4 text-xs">
        Share reports with my doctor
        <Switch checked={shared} onCheckedChange={setShared} />
      </label>
      <p className="text-xs text-muted-foreground">
        {shared ? "Dr. Patel can see new reports." : "Reports are private."}
      </p>
    </div>
  )
}

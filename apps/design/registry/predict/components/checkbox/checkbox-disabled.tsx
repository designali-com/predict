"use client"

import { Checkbox } from "@workspace/ui/components/checkbox"

export function CheckboxDisabled() {
  return (
    <div className="grid gap-3 text-xs text-muted-foreground">
      <label className="flex items-center gap-2">
        <Checkbox disabled />
        Genetic panel (not available in your region)
      </label>
      <label className="flex items-center gap-2">
        <Checkbox disabled defaultChecked />
        Core panel (always included)
      </label>
    </div>
  )
}

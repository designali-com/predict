"use client"

import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"

export function LabelWithControl() {
  return (
    <Label>
      <Switch defaultChecked />
      Share results with my clinician
    </Label>
  )
}

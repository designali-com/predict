"use client"

import { BellOffIcon } from "lucide-react"

import { Toggle } from "@workspace/ui/components/toggle"

export function ToggleDisabled() {
  return (
    <Toggle variant="outline" disabled aria-label="Mute">
      <BellOffIcon />
    </Toggle>
  )
}

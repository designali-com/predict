"use client"

import { BellIcon } from "lucide-react"

import { Toggle } from "@workspace/ui/components/toggle"

export function ToggleWithText() {
  return (
    <Toggle variant="outline">
      <BellIcon data-icon="inline-start" />
      Reminders
    </Toggle>
  )
}

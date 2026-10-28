"use client"

import { StarIcon } from "lucide-react"

import { Toggle } from "@workspace/ui/components/toggle"

export function ToggleOutline() {
  return (
    <Toggle variant="outline" aria-label="Favourite" defaultPressed>
      <StarIcon />
    </Toggle>
  )
}

"use client"

import { BookmarkIcon } from "lucide-react"

import { Toggle } from "@workspace/ui/components/toggle"

export function ToggleDemo() {
  return (
    <Toggle aria-label="Bookmark">
      <BookmarkIcon />
    </Toggle>
  )
}

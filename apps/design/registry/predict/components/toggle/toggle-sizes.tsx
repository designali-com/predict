"use client"

import { BookmarkIcon } from "lucide-react"

import { Toggle } from "@workspace/ui/components/toggle"

export function ToggleSizes() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Toggle variant="outline" size="sm" aria-label="Bookmark">
        <BookmarkIcon />
      </Toggle>
      <Toggle variant="outline" aria-label="Bookmark">
        <BookmarkIcon />
      </Toggle>
      <Toggle variant="outline" size="lg" aria-label="Bookmark">
        <BookmarkIcon />
      </Toggle>
    </div>
  )
}

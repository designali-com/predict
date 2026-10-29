"use client"

import * as React from "react"
import { BookmarkIcon } from "lucide-react"

import { Toggle } from "@workspace/ui/components/toggle"

export function ToggleControlled() {
  const [pressed, setPressed] = React.useState(false)

  return (
    <div className="flex flex-col items-center gap-3">
      <Toggle aria-label="Bookmark" pressed={pressed} onPressedChange={setPressed}>
        <BookmarkIcon />
      </Toggle>
      <p className="text-muted-foreground text-xs">
        {pressed ? "Bookmarked" : "Not bookmarked"}
      </p>
    </div>
  )
}

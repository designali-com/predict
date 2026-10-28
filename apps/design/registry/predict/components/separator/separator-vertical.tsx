"use client"

import { Separator } from "@workspace/ui/components/separator"

export function SeparatorVertical() {
  return (
    <div className="flex h-5 items-center gap-4 text-xs">
      <span>Overview</span>
      <Separator orientation="vertical" />
      <span>History</span>
      <Separator orientation="vertical" />
      <span>Notes</span>
    </div>
  )
}

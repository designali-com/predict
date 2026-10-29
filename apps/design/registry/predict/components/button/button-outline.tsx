"use client"

import { Button } from "@workspace/ui/components/button"

export function ButtonOutline() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button variant="outline">View report</Button>
      <Button variant="outlineglass">View report</Button>
    </div>
  )
}

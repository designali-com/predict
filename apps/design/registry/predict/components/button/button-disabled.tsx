"use client"

import { Button } from "@workspace/ui/components/button"

export function ButtonDisabled() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button disabled>Book test</Button>
      <Button variant="outline" disabled>
        Details
      </Button>
    </div>
  )
}

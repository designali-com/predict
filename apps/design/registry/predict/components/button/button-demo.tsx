"use client"

import { Button } from "@workspace/ui/components/button"

export function ButtonDemo() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button>Book test</Button>
      <Button variant="outline">Details</Button>
      <Button variant="secondary">Later</Button>
      <Button variant="ghost">Skip</Button>
      <Button variant="destructive">Delete</Button>
      <Button variant="link">Learn more</Button>
      <Button variant="invert">Invert</Button>
    </div>
  )
}

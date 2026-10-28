"use client"

import { PlusIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

export function ButtonSizes() {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="sm">Small</Button>
        <Button size="default">Default</Button>
        <Button size="lg">Large</Button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="icon-sm" aria-label="Add">
          <PlusIcon />
        </Button>
        <Button size="icon" aria-label="Add">
          <PlusIcon />
        </Button>
        <Button size="icon-lg" aria-label="Add">
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}

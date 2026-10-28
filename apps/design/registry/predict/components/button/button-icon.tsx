"use client"

import { DownloadIcon, PlusIcon, ShareIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

export function ButtonIcon() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button size="icon" aria-label="Add marker">
        <PlusIcon />
      </Button>
      <Button size="icon" variant="outline" aria-label="Download report">
        <DownloadIcon />
      </Button>
      <Button size="icon" variant="ghost" aria-label="Share">
        <ShareIcon />
      </Button>
    </div>
  )
}

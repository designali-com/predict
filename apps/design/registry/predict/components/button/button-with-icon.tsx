"use client"

import { ArrowRightIcon, DownloadIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

export function ButtonWithIcon() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button size="sm">
        <DownloadIcon data-icon="inline-start" />
        Download
      </Button>
      <Button variant="outline">
        <DownloadIcon data-icon="inline-start" />
        Download
      </Button>
      <Button>
        Continue
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
      <Button variant="secondary" size="lg">
        <DownloadIcon data-icon="inline-start" />
        Download
      </Button>
      <Button size="lg">
        Continue
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </div>
  )
}

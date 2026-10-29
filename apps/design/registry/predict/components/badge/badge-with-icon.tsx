"use client"

import { ArrowDownIcon, ArrowUpIcon, CircleCheckIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"

export function BadgeWithIcon() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Badge variant="outline">
        <CircleCheckIcon data-icon="inline-start" className="text-status-normal" />
        In range
      </Badge>
      <Badge variant="destructive">
        <ArrowUpIcon data-icon="inline-start" />
        High
      </Badge>
      <Badge variant="secondary">
        Low
        <ArrowDownIcon data-icon="inline-end" />
      </Badge>
    </div>
  )
}

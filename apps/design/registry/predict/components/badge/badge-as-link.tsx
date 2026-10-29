"use client"

import { ArrowRightIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"

export function BadgeAsLink() {
  return (
    <Badge render={<a href="#" />} variant="outline">
      View report
      <ArrowRightIcon data-icon="inline-end" />
    </Badge>
  )
}

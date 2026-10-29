"use client"

import { CheckIcon } from "lucide-react"

import { Avatar, AvatarBadge, AvatarFallback } from "@workspace/ui/components/avatar"

export function AvatarWithBadge() {
  return (
    <div className="flex items-center gap-3">
      <Avatar>
        <AvatarFallback>SP</AvatarFallback>
        <AvatarBadge className="bg-status-normal" />
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>SP</AvatarFallback>
        <AvatarBadge>
          <CheckIcon />
        </AvatarBadge>
      </Avatar>
    </div>
  )
}

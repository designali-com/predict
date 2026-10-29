"use client"

import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"

export function AvatarSizes() {
  return (
    <div className="flex items-center gap-3">
      <Avatar size="sm">
        <AvatarFallback>AM</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>AM</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>AM</AvatarFallback>
      </Avatar>
    </div>
  )
}

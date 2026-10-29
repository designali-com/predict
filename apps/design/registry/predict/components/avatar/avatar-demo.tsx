"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar"

export function AvatarDemo() {
  return (
    <div className="flex items-center gap-3">
      <Avatar>
        <AvatarImage src="/apple-touch-icon.png" alt="PREDICT" />
        <AvatarFallback>PR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>AM</AvatarFallback>
      </Avatar>
    </div>
  )
}

"use client"

import { Input } from "@workspace/ui/components/input"

export function InputDemo() {
  return (
    <label className="grid w-full max-w-sm gap-1.5 text-xs font-medium">
      Email
      <Input type="email" placeholder="you@example.com" />
    </label>
  )
}

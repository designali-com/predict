"use client"

import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

export function LabelDemo() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <Label htmlFor="label-demo-email">Email</Label>
      <Input id="label-demo-email" type="email" placeholder="you@example.com" />
    </div>
  )
}

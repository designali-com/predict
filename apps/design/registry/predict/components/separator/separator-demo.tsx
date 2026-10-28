"use client"

import { Separator } from "@workspace/ui/components/separator"

export function SeparatorDemo() {
  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Heart health</p>
        <p className="text-xs text-muted-foreground">
          Seven markers from your October panel.
        </p>
      </div>
      <Separator className="my-4" />
      <p className="text-xs">ApoB, LDL-C, HDL-C, Triglycerides, Lp(a).</p>
    </div>
  )
}

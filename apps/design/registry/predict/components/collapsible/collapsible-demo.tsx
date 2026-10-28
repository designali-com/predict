"use client"

import { ChevronsUpDownIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"

export function CollapsibleDemo() {
  return (
    <Collapsible className="flex w-full max-w-xs flex-col gap-2">
      <div className="flex items-center justify-between gap-4 px-3">
        <p className="text-sm font-medium">3 markers out of range</p>
        <CollapsibleTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Toggle markers" />}
        >
          <ChevronsUpDownIcon />
        </CollapsibleTrigger>
      </div>
      <div className="rounded-md border px-3 py-2 text-xs">LDL-C · 142 mg/dL</div>
      <CollapsibleContent className="flex flex-col gap-2">
        <div className="rounded-md border px-3 py-2 text-xs">HbA1c · 5.9 %</div>
        <div className="rounded-md border px-3 py-2 text-xs">Vitamin D · 22 ng/mL</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

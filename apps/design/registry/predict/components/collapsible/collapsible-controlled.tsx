"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"

export function CollapsibleControlled() {
  const [open, setOpen] = React.useState(false)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="flex w-full max-w-xs flex-col gap-2"
    >
      <p className="text-xs text-muted-foreground">
        Your ApoB is in the optimal range. LDL-C is slightly high.
      </p>
      <CollapsibleContent className="text-xs text-muted-foreground">
        LDL-C measures the cholesterol carried by LDL particles. ApoB counts the
        particles themselves, so the two can disagree.
      </CollapsibleContent>
      <CollapsibleTrigger render={<Button variant="link" size="sm" className="w-fit px-0" />}>
        {open ? "Show less" : "Read more"}
      </CollapsibleTrigger>
    </Collapsible>
  )
}

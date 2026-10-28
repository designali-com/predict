"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

const sides = ["top", "right", "bottom", "left"] as const

export function TooltipSides() {
  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {sides.map((side) => (
          <Tooltip key={side}>
            <TooltipTrigger render={<Button variant="ghost" className="capitalize" />}>
              {side}
            </TooltipTrigger>
            <TooltipContent side={side}>Opens on the {side}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}

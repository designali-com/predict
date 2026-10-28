"use client"

import { DownloadIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

export function TooltipDemo() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<Button variant="outline" size="icon" aria-label="Download report" />}
        >
          <DownloadIcon />
        </TooltipTrigger>
        <TooltipContent>Download report</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

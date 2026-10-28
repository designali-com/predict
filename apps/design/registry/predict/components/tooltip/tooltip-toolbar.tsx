"use client"

import { DownloadIcon, PrinterIcon, ShareIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

const actions = [
  { label: "Download report", icon: DownloadIcon },
  { label: "Share with doctor", icon: ShareIcon },
  { label: "Print", icon: PrinterIcon },
]

export function TooltipToolbar() {
  return (
    <TooltipProvider delay={300}>
      <div className="flex items-center gap-1 rounded-full border p-1">
        {actions.map((action) => (
          <Tooltip key={action.label}>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={action.label} />}
            >
              <action.icon />
            </TooltipTrigger>
            <TooltipContent>{action.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}

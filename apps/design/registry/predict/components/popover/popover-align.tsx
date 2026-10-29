"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

const aligns = ["start", "center", "end"] as const

export function PopoverAlign() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {aligns.map((align) => (
        <Popover key={align}>
          <PopoverTrigger render={<Button variant="outline" className="capitalize" />}>
            {align}
          </PopoverTrigger>
          <PopoverContent align={align} className="w-56">
            <PopoverHeader>
              <PopoverTitle className="capitalize">{align}</PopoverTitle>
              <PopoverDescription>Lines up with the {align} of its trigger.</PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  )
}

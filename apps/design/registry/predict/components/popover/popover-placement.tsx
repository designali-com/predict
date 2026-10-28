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

const sides = ["top", "right", "bottom", "left"] as const

export function PopoverPlacement() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {sides.map((side) => (
        <Popover key={side}>
          <PopoverTrigger render={<Button variant="ghost" className="capitalize" />}>
            {side}
          </PopoverTrigger>
          <PopoverContent side={side} className="w-56">
            <PopoverHeader>
              <PopoverTitle className="capitalize">{side}</PopoverTitle>
              <PopoverDescription>Opens on the {side} of its trigger.</PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  )
}

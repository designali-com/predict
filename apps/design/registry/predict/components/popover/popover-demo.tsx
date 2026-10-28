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

export function PopoverDemo() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>What is ApoB?</PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Apolipoprotein B</PopoverTitle>
          <PopoverDescription>
            Counts the particles that carry cholesterol into artery walls. It
            predicts heart risk better than LDL-C alone.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  )
}

"use client"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

export function PopoverForm() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>Set target</PopoverTrigger>
      <PopoverContent className="w-64">
        <PopoverHeader>
          <PopoverTitle>Daily step target</PopoverTitle>
          <PopoverDescription>Shown as a line on your activity chart.</PopoverDescription>
        </PopoverHeader>
        <div className="flex items-center gap-2">
          <Input type="number" defaultValue={8000} aria-label="Steps" />
          <Button size="sm">Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

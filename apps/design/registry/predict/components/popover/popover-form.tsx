"use client"

import { Button } from "@workspace/ui/components/button"
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@workspace/ui/components/number-field"
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
      <PopoverContent className="w-72">
        <PopoverHeader>
          <PopoverTitle>Daily step target</PopoverTitle>
          <PopoverDescription>Shown as a line on your activity chart.</PopoverDescription>
        </PopoverHeader>
        <div className="flex items-center gap-2">
          <NumberField size="sm" defaultValue={8000} min={0} step={500}>
            <NumberFieldGroup>
              <NumberFieldDecrement />
              <NumberFieldInput aria-label="Daily step target" />
              <NumberFieldIncrement />
            </NumberFieldGroup>
          </NumberField>
          <Button size="sm">Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

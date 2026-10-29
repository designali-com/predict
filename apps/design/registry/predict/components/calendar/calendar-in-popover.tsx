"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

export function CalendarInPopover() {
  const [open, setOpen] = React.useState(false)
  const [date, setDate] = React.useState<Date | undefined>()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" className="w-56 justify-between font-normal" />}
      >
        {date ? date.toLocaleDateString(undefined, { dateStyle: "medium" }) : "Pick a test date"}
        <CalendarIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(next) => {
            setDate(next)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

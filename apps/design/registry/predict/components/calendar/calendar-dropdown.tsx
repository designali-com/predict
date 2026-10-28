"use client"

import * as React from "react"

import { Calendar } from "@workspace/ui/components/calendar"

export function CalendarDropdown() {
  const [date, setDate] = React.useState<Date | undefined>(new Date(1994, 4, 12))

  return (
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      defaultMonth={date}
      captionLayout="dropdown"
      className="rounded-lg border"
    />
  )
}

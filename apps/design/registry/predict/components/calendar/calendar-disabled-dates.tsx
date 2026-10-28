"use client"

import * as React from "react"

import { Calendar } from "@workspace/ui/components/calendar"

export function CalendarDisabledDates() {
  const [date, setDate] = React.useState<Date | undefined>()

  return (
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      disabled={[{ before: new Date() }, { dayOfWeek: [0] }]}
      className="rounded-lg border"
    />
  )
}

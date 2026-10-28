"use client"

import * as React from "react"

import { Calendar } from "@workspace/ui/components/calendar"

type DateRange = { from: Date | undefined; to?: Date }

export function CalendarRange() {
  const [range, setRange] = React.useState<DateRange | undefined>(() => {
    const from = new Date()
    const to = new Date()
    to.setDate(from.getDate() + 4)
    return { from, to }
  })

  return (
    <Calendar
      mode="range"
      selected={range}
      onSelect={setRange}
      numberOfMonths={2}
      className="rounded-lg border"
    />
  )
}

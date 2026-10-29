"use client"

import * as React from "react"
import { CheckIcon, MapPinIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { Separator } from "@workspace/ui/components/separator"

// Blood draws need a fast, so only morning slots.
const slots = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30"]

const clinics = [
  { value: "andheri", name: "Andheri West", address: "Link Road, Mumbai" },
  { value: "bandra", name: "Bandra", address: "Hill Road, Mumbai" },
  { value: "home", name: "Home visit", address: "A phlebotomist comes to you" },
]

function tomorrow() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date
}

export default function Page() {
  const [date, setDate] = React.useState<Date | undefined>(tomorrow)
  const [slot, setSlot] = React.useState("08:00")
  const [clinic, setClinic] = React.useState("andheri")

  const clinicName = clinics.find((c) => c.value === clinic)?.name
  const dateLabel = date?.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Book your blood test</CardTitle>
          <CardDescription>Fast for 10 to 12 hours before your slot. Water is fine.</CardDescription>
        </CardHeader>

        <CardContent className="grid gap-6 md:grid-cols-[auto_1fr]">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            disabled={{ before: tomorrow() }}
            className="mx-auto rounded-lg border"
          />

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 id="slot-label" className="text-xs font-medium">Time</h2>
              <RadioGroup
                value={slot}
                onValueChange={(value) => setSlot(value as string)}
                aria-labelledby="slot-label"
                className="grid grid-cols-4 gap-2"
              >
                {slots.map((time) => (
                  <label
                    key={time}
                    className="flex cursor-pointer items-center justify-center rounded-full border py-2 text-xs tabular-nums has-data-checked:border-primary has-data-checked:bg-primary has-data-checked:text-primary-foreground"
                  >
                    <RadioGroupItem value={time} className="sr-only" />
                    {time}
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="flex flex-col gap-2">
              <h2 id="clinic-label" className="text-xs font-medium">Where</h2>
              <RadioGroup
                value={clinic}
                onValueChange={(value) => setClinic(value as string)}
                aria-labelledby="clinic-label"
              >
                {clinics.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-start gap-3 rounded-lg border p-3 has-data-checked:border-primary"
                  >
                    <RadioGroupItem value={option.value} className="mt-0.5" />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">{option.name}</span>
                      <span className="text-xs text-muted-foreground">{option.address}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          </div>
        </CardContent>

        <Separator />

        <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPinIcon className="size-3.5 shrink-0" />
            {date ? `${dateLabel} at ${slot}, ${clinicName}` : "Pick a date"}
          </p>
          <Dialog>
            <DialogTrigger render={<Button disabled={!date} />}>Confirm booking</DialogTrigger>
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-status-normal/15 text-status-normal">
                  <CheckIcon className="size-5" />
                </div>
                <DialogTitle>You're booked</DialogTitle>
                <DialogDescription>
                  {dateLabel} at {slot}, {clinicName}. We'll send a reminder the evening before.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button />}>Done</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardFooter>
      </Card>
    </div>
  )
}

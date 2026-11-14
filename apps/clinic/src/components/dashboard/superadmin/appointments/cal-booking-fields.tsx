"use client"

import { Button } from "@workspace/ui/components/button"

import { useEffect, useState } from "react"
import { Video, Building2, CalendarDays } from "lucide-react"
import { Calendar } from "@workspace/ui/components/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { PredictSpinner } from "@/src/components/predict-loader"

export type BookingChannel = "virtual" | "in_clinic"

interface Slot {
  id: string
  label: string
  startIso: string
  remaining: number
  capacity: number
}

interface CalBookingFieldsProps {
  /** Whose calendar. Slots belong to a doctor; without one there are none. */
  doctorUserId: string | undefined
  date: Date | undefined
  onDateChange: (date: Date | undefined) => void
  startIso: string | undefined
  onSlotChange: (startIso: string | undefined) => void
  channel: BookingChannel | undefined
  onChannelChange: (channel: BookingChannel) => void
  /** Leave out Virtual / In-clinic — the page shows ChannelPicker elsewhere. */
  hideChannel?: boolean
}

// The clinic's calendar day for a date the picker produced. toISOString()
// renders in UTC, which names the previous day for anything before 05:30 —
// and then the slots come back for a weekday nobody selected.
function toIsoDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${m}-${d}`
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Calcutta",
  })
}

/** "Tue, 9 Sep" — enough to be sure the times belong to the day you clicked. */
function formatDay(date: Date): string {
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
}

// Date, time and channel picker, shared by the staff "new
// appointment" forms (page + modal) — replaces the old free-typed
// datetime-local input so staff bookings get a real slot + a real
// Google Meet link / address, same as the patient-facing flow.
export function CalBookingFields({
  doctorUserId,
  date,
  onDateChange,
  startIso,
  onSlotChange,
  channel,
  onChannelChange,
  hideChannel = false,
}: CalBookingFieldsProps) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [closedReason, setClosedReason] = useState<string | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  useEffect(() => {
    // Both are needed: a slot is a time on one doctor's calendar.
    if (!date || !doctorUserId) {
      setSlots([])
      setClosedReason(null)
      return
    }
    setLoadingSlots(true)
    setSlotsError(null)
    fetch(
      `/api/staff/appointments/slots?date=${toIsoDate(date)}&doctorUserId=${encodeURIComponent(doctorUserId)}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setSlotsError(data.error)
          setSlots([])
          return
        }
        setSlots(data.slots ?? [])
        setClosedReason(data.closedReason ?? null)
      })
      .catch(() => setSlotsError("Unable to load available times."))
      .finally(() => setLoadingSlots(false))
  }, [date, doctorUserId])

  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs font-medium text-black/65 dark:text-white/50">
        Date &amp; time<span className="text-red-600"> *</span>
      </label>

      {/* A date first — the next week as chips, any other day from a small
          calendar on demand — and then that day's times. An open month
          calendar took half the form before anyone had chosen anything. */}
      <DayChips
        date={date}
        onPick={(d) => {
          onDateChange(d)
          onSlotChange(undefined)
        }}
      />

      {(date || !doctorUserId) && (
        <div className="min-w-0 rounded-md border border-black/22 dark:border-white/15">
          {date && (
            <div className="border-b border-black/12 px-3 py-1.5 text-xs font-medium text-black/65 dark:border-white/10 dark:text-white/50">
              {formatDay(date)}
            </div>
          )}
          <div className="p-3">
              {!doctorUserId ? (
                <p className="py-2 text-xs text-black/60 dark:text-white/40">
                  Choose a doctor above — these are their working hours.
                </p>
              ) : !date ? (
                <p className="py-2 text-xs text-black/60 dark:text-white/40">
                  Pick a date to see when they are free.
                </p>
              ) : loadingSlots ? (
                <div className="flex items-center gap-2 py-2 text-sm text-black/60 dark:text-white/40">
                  <PredictSpinner className="size-4" /> Loading available times…
                </div>
              ) : slotsError ? (
                <p className="py-2 text-xs text-red-600 dark:text-red-400">{slotsError}</p>
              ) : slots.length === 0 ? (
                // Says WHY there is nothing — not working that day, on leave, or
                // no hours set at all. "Try another date" was the same sentence
                // for all three, and only one of them is about the date.
                <p className="py-2 text-xs text-black/60 dark:text-white/40">
                  {closedReason ?? "No hours set for this doctor — they can add them under My Availability."}
                </p>
              ) : slots.every((s) => s.remaining <= 0) ? (
                <p className="py-2 text-xs text-amber-800 dark:text-amber-300">
                  Fully booked on this date — try another day, or another doctor.
                </p>
              ) : (
                // Columns come from the width, not from a breakpoint: opening the
                // sidebar narrows this panel without changing the viewport, so a
                // fixed four-across just squashed the times. auto-fill drops to
                // three or two instead, and each track keeps a readable floor.
                //
                // Scrolls rather than stretching: a 15-minute day produces enough
                // buttons to push the rest of the form off the screen.
                <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
                  {slots.map((slot) => {
                    const taken = slot.remaining <= 0
                    return (
                      <Button variant="ghost" size="sm"
                        key={slot.id}
                        type="button"
                        disabled={taken}
                        title={taken ? "Already booked" : undefined}
                        onClick={() => onSlotChange(slot.startIso)}
                        className={`h-fit border px-1.5 py-2 text-xs font-medium whitespace-nowrap transition ${
   startIso === slot.startIso
   ?"border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
   : taken
   ?"cursor-not-allowed border-black/18 text-black/25 line-through dark:border-white/10 dark:text-white/25"
   :"border-black/22 text-black hover:bg-black/5 dark:border-white/15 dark:text-white dark:hover:bg-white/5"
   }`}
                      >
                        {formatTime(slot.startIso)}
                        {/* A doctor who sees two at once has two places in a slot;
                            showing the second one left stops it looking taken. */}
                        {!taken && slot.capacity > 1 && (
                          <span className="ml-1 opacity-60">({slot.remaining})</span>
                        )}
                      </Button>
                    )
                  })}
                </div>
              )}
          </div>
        </div>
      )}

      {!hideChannel && <ChannelPicker channel={channel} onChannelChange={onChannelChange} />}
    </div>
  )
}

/** Virtual or in the clinic. */
export function ChannelPicker({
  channel,
  onChannelChange,
}: {
  channel: BookingChannel | undefined
  onChannelChange: (channel: BookingChannel) => void
}) {
  const option = (value: BookingChannel, label: string, Icon: typeof Video) => (
    <button
      type="button"
      onClick={() => onChannelChange(value)}
      className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
        channel === value
          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
          : "border-black/22 bg-white text-black hover:border-black/45 hover:bg-black/[0.04] dark:border-white/15 dark:bg-black dark:text-white dark:hover:bg-white/[0.06]"
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  )
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-black/65 dark:text-white/50">
        Appointment type<span className="text-red-600"> *</span>
      </span>
      <div className="grid grid-cols-2 gap-2">
        {option("in_clinic", "In clinic", Building2)}
        {option("virtual", "Virtual", Video)}
      </div>
    </div>
  )
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * The next seven days as one-tap chips, and "Other date" for anything later —
 * a small calendar that opens only when asked for.
 */
function DayChips({ date, onPick }: { date: Date | undefined; onPick: (d: Date | undefined) => void }) {
  const [open, setOpen] = useState(false)
  const today = startOfToday()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d
  })
  const outside = date && !days.some((d) => sameDay(d, date))

  const chip = (on: boolean) =>
    `flex min-w-[3.6rem] flex-col items-center rounded-md border px-2 py-1 text-center transition-colors ${
      on
        ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
        : "border-black/22 bg-white text-black hover:border-black/45 hover:bg-black/[0.04] dark:border-white/15 dark:bg-black dark:text-white dark:hover:bg-white/[0.06]"
    }`

  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((d, i) => (
        <button key={d.toISOString()} type="button" onClick={() => onPick(d)} className={chip(Boolean(date && sameDay(d, date)))}>
          <span className="text-[10px] font-medium uppercase opacity-70">
            {i === 0 ? "Today" : i === 1 ? "Tmrw" : d.toLocaleDateString("en-IN", { weekday: "short" })}
          </span>
          <span className="text-sm font-semibold leading-tight">{d.getDate()}</span>
        </button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={`${chip(Boolean(outside))} justify-center gap-0.5`}>
          <CalendarDays className="h-4 w-4" />
          <span className="text-[10px] font-medium leading-tight">
            {outside ? date!.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Other"}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              onPick(d)
              setOpen(false)
            }}
            disabled={(day) => day < startOfToday()}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

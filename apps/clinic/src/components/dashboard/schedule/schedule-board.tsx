"use client"

import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Hospital,
  UserCheck,
} from "lucide-react"

interface BoardDay {
  date: string
  capacity: number
  booked: number
  closedReason: string | null
}

interface BoardRow {
  clinicianId: string
  name: string
  role: string | null
  days: BoardDay[]
  totalCapacity: number
  totalBooked: number
  utilisation: number | null
  noHoursSet: boolean
}

interface TherapyRow {
  sittingId: string
  contactId: string
  dayNumber: number
  mode: string
  status: string
  appointmentId: string | null
  patientName: string | null
  phone: string | null
  planName: string
  sittings: number
}

function today(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function shift(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10)
}

function dayLabel(date: string): { weekday: string; day: string } {
  const [y, m, d] = date.split("-").map(Number)
  const at = new Date(Date.UTC(y!, m! - 1, d!))
  return {
    weekday: at.toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short" }),
    day: at.toLocaleDateString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short" }),
  }
}

function roleLabel(role: string | null): string {
  return role ? role.replace(/_/g, " ") : "staff"
}

/**
 * Who is in, who is free, and who is away — the whole week, everyone at once.
 *
 * This replaced a staff directory: three hard-coded role cards, a list of
 * names that duplicated the Team page, and one doctor's month calendar that
 * printed "No appointments — free" on days they were on leave.
 *
 * The question a front desk actually has is "can you fit me in on Thursday?",
 * and answering it meant opening four calendars one at a time. Here it is one
 * glance: booked against capacity per person per day, with leave shown as
 * leave rather than as a quiet day.
 */
export function ScheduleBoard() {
  const [from, setFrom] = useState(today())
  const [rows, setRows] = useState<BoardRow[]>([])
  const [dates, setDates] = useState<string[]>([])
  const [therapy, setTherapy] = useState<TherapyRow[]>([])
  // Which row is mid-action, so two clicks cannot check the same person in
  // twice while the first request is still in the air.
  const [acting, setActing] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [therapyDate, setTherapyDate] = useState(today())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/schedule?from=${from}&therapyDate=${therapyDate}`)
    const data = await res.json().catch(() => null)
    setRows(data?.rows ?? [])
    setDates(data?.dates ?? [])
    setTherapy(data?.therapy ?? [])
  }, [from, therapyDate])

  const checkIn = async (sittingId: string) => {
    setActing(sittingId)
    setRowError(null)
    try {
      const res = await fetch(`/api/staff/sittings/${sittingId}/check-in`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setRowError(data?.error ?? "Could not check that day in")
        return
      }
      await load()
    } finally {
      setActing(null)
    }
  }

  const logSitting = async (sittingId: string, status: "done" | "missed") => {
    setActing(sittingId)
    setRowError(null)
    try {
      const res = await fetch(`/api/staff/sittings/${sittingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setRowError(data?.error ?? "Could not update that day")
        return
      }
      await load()
    } finally {
      setActing(null)
    }
  }


  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const weekCapacity = rows.reduce((n, r) => n + r.totalCapacity, 0)
  const weekBooked = rows.reduce((n, r) => n + r.totalBooked, 0)
  const weekFree = Math.max(0, weekCapacity - weekBooked)
  const todayIso = today()
  const range =
    dates.length > 0
      ? `${rangeLabel(dates[0]!)} – ${rangeLabel(dates[dates.length - 1]!, true)}`
      : ""

  return (
    <div className="flex w-full flex-col gap-3 p-3 lg:p-4">
      <PageHeader
        title="Schedule"
        description={range ? `Week of ${range}` : "Who is free, day by day"}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => setFrom(shift(from, -7))} aria-label="Previous week">
              <ChevronLeft />
            </Button>
            <Button variant={from === todayIso ? "default" : "outline"} size="sm" onClick={() => setFrom(todayIso)}>
              This week
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => setFrom(shift(from, 7))} aria-label="Next week">
              <ChevronRight />
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className={`flex justify-center py-16 ${CARD}`}>
          <PredictSpinner />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/22 p-8 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/40">
          Nobody has working hours set, so nothing can be booked. Each clinician sets theirs under My Availability.
        </p>
      ) : (
        <>
          {/* The week at a glance. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Slots this week" value={weekCapacity} />
            <Tile label="Booked" value={weekBooked} tone="text-emerald-700 dark:text-emerald-400" />
            <Tile label="Free" value={weekFree} />
            <Tile
              label="Filled"
              value={weekCapacity > 0 ? `${Math.round((weekBooked / weekCapacity) * 100)}%` : "—"}
            />
          </div>

          <div className={`overflow-x-auto ${CARD}`}>
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/12 dark:border-white/10">
                  <th className="sticky left-0 z-10 w-48 bg-white px-3 py-2 text-left text-xs font-medium text-black/60 dark:bg-black dark:text-white/45">
                    Clinician
                  </th>
                  {dates.map((date) => {
                    const { weekday, day } = dayLabel(date)
                    const isToday = date === todayIso
                    const weekend = weekday === "Sun"
                    return (
                      <th key={date} className={`px-1.5 py-2 text-center ${weekend ? "bg-black/[0.02] dark:bg-white/[0.02]" : ""}`}>
                        <span
                          className={`mx-auto flex w-fit flex-col items-center rounded-md px-2 py-1 leading-tight ${
                            isToday ? "bg-primary text-primary-foreground" : "text-black/70 dark:text-white/60"
                          }`}
                        >
                          <span className="text-[11px] font-medium uppercase tracking-wide">{isToday ? "Today" : weekday}</span>
                          <span className="text-sm font-semibold">{day}</span>
                        </span>
                      </th>
                    )
                  })}
                  <th className="px-3 py-2 text-right text-xs font-medium text-black/60 dark:text-white/45">Week</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.clinicianId} className="border-b border-black/8 last:border-0 dark:border-white/5">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 dark:bg-black">
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">
                          {initials(row.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{row.name}</span>
                          <span className="block truncate text-[11px] capitalize text-black/55 dark:text-white/40">
                            {roleLabel(row.role)}
                            {row.noHoursSet && " · no hours set"}
                          </span>
                        </span>
                      </div>
                    </td>

                    {row.days.map((day) => (
                      <td key={day.date} className={`px-1.5 py-2 ${day.date === todayIso ? "bg-primary/[0.04]" : ""}`}>
                        <DayCell day={day} clinicianId={row.clinicianId} />
                      </td>
                    ))}

                    <td className="px-3 py-2 text-right">
                      {/* Null, not 0%, for somebody with no hours — "not busy"
                          and "not working" are different facts. */}
                      {row.utilisation === null ? (
                        <span className="text-xs text-black/50 dark:text-white/40">—</span>
                      ) : (
                        <>
                          <span className="block font-semibold tabular-nums">{Math.round(row.utilisation * 100)}%</span>
                          <span className="block text-[11px] tabular-nums text-black/55 dark:text-white/40">
                            {row.totalBooked}/{row.totalCapacity}
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-black/60 dark:text-white/45">
            <Legend swatch="bg-emerald-500" label="Has free slots" />
            <Legend swatch="bg-amber-500" label="Fully booked" />
            <Legend swatch="bg-black/15 dark:bg-white/20" label="Off / on leave" />          </div>
        </>
      )}
    </div>
  )
}

const CARD = "rounded-lg border border-black/12 bg-white dark:border-white/10 dark:bg-black"

function rangeLabel(date: string, withYear = false): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  })
}

function initials(name: string): string {
  return (
    name
      .replace(/^dr\.?\s+/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || "?"
  )
}

function Tile({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className={`px-3 py-2 ${CARD}`}>
      <p className="text-[11px] font-medium text-black/55 dark:text-white/45">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-sm ${swatch}`} /> {label}
    </span>
  )
}

/**
 * One clinician, one day: booked of slots with a bar, and how many are free.
 * "Off" and leave print as such, because a day off read as a free day before.
 */
function DayCell({ day, clinicianId }: { day: BoardDay; clinicianId: string }) {
  if (day.closedReason) {
    const short = /leave/i.test(day.closedReason) ? "Leave" : "Off"
    return (
      <span
        className="flex h-[52px] flex-col items-center justify-center rounded-md bg-black/[0.04] px-1 text-[11px] font-medium text-black/50 dark:bg-white/[0.06] dark:text-white/40"
        title={day.closedReason}
      >
        {short}
      </span>
    )
  }

  const full = day.booked >= day.capacity
  const free = Math.max(0, day.capacity - day.booked)
  const pct = day.capacity > 0 ? Math.min(100, Math.round((day.booked / day.capacity) * 100)) : 0

  return (
    <Link
      href={`/appointments/new?doctorUserId=${clinicianId}&date=${day.date}`}
      title={full ? "Fully booked" : `${free} free — click to book`}
      className={`flex h-[52px] flex-col justify-between rounded-md border px-2 py-1.5 transition-colors ${
        full
          ? "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15"
          : "border-black/10 hover:border-emerald-500/50 hover:bg-emerald-500/[0.06] dark:border-white/10"
      }`}
    >
      <span className="flex items-baseline justify-between gap-1">
        <span className="text-sm font-semibold tabular-nums">
          {day.booked}
          <span className="text-[11px] font-normal text-black/45 dark:text-white/40">/{day.capacity}</span>
        </span>
        <span
          className={`text-[10px] font-medium ${
            full ? "text-amber-800 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {full ? "Full" : `${free} free`}
        </span>
      </span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10">
        <span
          className={`block h-full rounded-full ${full ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </Link>
  )
}

/**
 * What the front desk can do about this day, without leaving this list.
 *
 * This is the whole point of the board. The day, the course and the day number
 * were all decided when the course was activated, so nobody here has to ask
 * the patient what they came for — or open their record to find out.
 */
function SittingActions({
  row,
  busy,
  onCheckIn,
  onLog,
}: {
  row: TherapyRow
  busy: boolean
  onCheckIn: () => void
  onLog: (status: "done" | "missed") => void
}) {
  if (row.status === "done" || row.status === "missed") return null

  // An at-home day is the patient's to log, on their own app. Offering staff a
  // button for it invites two people answering the same question differently.
  if (row.mode === "at_home") {
    return (
      <span className="text-[11px] text-black/45 dark:text-white/30">Logged by the patient</span>
    )
  }

  if (busy) {
    return <PredictSpinner className="size-4" />
  }

  // Not in the book yet: one click puts them in it. No doctor, no slot, no
  // visit kind — none of those are questions the desk can answer better than
  // the schedule already has.
  if (!row.appointmentId) {
    return (
      <Button variant="default" size="sm"
 onClick={onCheckIn}

 >
        <UserCheck className="h-3 w-3" />
        Check in
      </Button>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="outline" size="sm" className="hover:bg-black/5 dark:hover:bg-white/5"
 onClick={() => onLog("done")}

 >
        Done
      </Button>
      <Button variant="outline" size="sm" className="text-black/60 hover:bg-black/5 dark:text-white/40 dark:hover:bg-white/5"
 onClick={() => onLog("missed")}

 >
        Missed
      </Button>
    </div>
  )
}

function SittingState({ row }: { row: TherapyRow }) {
  if (row.status === "done") {
    return <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Done</span>
  }
  if (row.status === "missed") {
    return <span className="text-xs font-medium text-red-700 dark:text-red-400">Missed</span>
  }
  // A clinic day with no appointment is the one that needs chasing — nobody has
  // booked them in, so they will not turn up.
  if (row.mode === "in_clinic" && !row.appointmentId) {
    return <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Not booked</span>
  }
  return <span className="text-xs text-black/60 dark:text-white/40">Pending</span>
}

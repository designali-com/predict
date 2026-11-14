"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CalendarClock, Eye, Plus } from "lucide-react"
import { NewAppointmentModal } from "./new-appointment-modal"

interface AppointmentRow {
  id: string
  type: string
  scheduledAt: string
  status: string
  doctorName: string | null
  /** "Therapy · day 3 of 6" — derived, not the stored type. */
  kindDetail?: string | null
}

const TYPE_LABELS: Record<string, string> = {
  consultation: "Consultation",
  review: "Review",
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Visited",
  cancelled: "Cancelled",
  no_show: "Not Visited",
}

type DateFilter = "all" | "today" | "week" | "month" | "year" | "custom"

const FILTERS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "week", label: "Last Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
]

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

// Presets are rolling windows ending "now" (e.g. Last Week = past 7 days),
// not calendar-aligned periods — simplest to reason about, matches how
// most analytics-style filters behave.
function computePresetRange(filter: DateFilter): { from: Date; to: Date } | null {
  const to = new Date()
  const from = new Date()

  switch (filter) {
    case "today":
      from.setHours(0, 0, 0, 0)
      return { from, to }
    case "week":
      from.setDate(from.getDate() - 7)
      return { from, to }
    case "month":
      from.setDate(from.getDate() - 30)
      return { from, to }
    case "year":
      from.setDate(from.getDate() - 365)
      return { from, to }
    default:
      return null
  }
}

interface AppointmentListProps {
  patientId: string
}

export function AppointmentList({ patientId }: AppointmentListProps) {
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [filter, setFilter] = useState<DateFilter>("all")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()))

  const range = useMemo(() => {
    if (filter === "custom") {
      return {
        from: customFrom ? new Date(customFrom) : null,
        to: customTo ? new Date(`${customTo}T23:59:59.999`) : null,
      }
    }
    return computePresetRange(filter)
  }, [filter, customFrom, customTo])

  const fetchAppointments = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ patientId })
      if (range?.from) params.set("from", range.from.toISOString())
      if (range?.to) params.set("to", range.to.toISOString())

      const res = await fetch(`/api/staff/appointments?${params}`)
      const data = await res.json()
      setAppointments(data.appointments ?? [])
    } catch {
      setAppointments([])
    } finally {
      setIsLoading(false)
    }
  }, [patientId, range])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  return (
    <div className="flex flex-col gap-4 p-4 text-black dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Appointments</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {FILTERS.map((f) => (
            <Button variant="ghost" size="sm"
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
 filter === f.value
 ?"border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
 :"border-black/22 text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/5"
 }`}
            >
              {f.label}
            </Button>
          ))}

          {filter === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border border-black/22 bg-white px-3 py-1.5 text-xs text-black outline-none focus:border-black/40 dark:border-white/15 dark:bg-black dark:text-white dark:focus:border-white/40"
              />
              <span className="text-xs text-black/65 dark:text-white/40">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-black/22 bg-white px-3 py-1.5 text-xs text-black outline-none focus:border-black/40 dark:border-white/15 dark:bg-black dark:text-white dark:focus:border-white/40"
              />
            </div>
          )}
          <Button variant="simple" size="lg" className="active:scale-95"
 onClick={() => setModalOpen(true)}
 >
            <Plus className="h-4 w-4" />
            New Appointment
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center text-black/65 dark:text-white/40">
          <PredictSpinner />
        </div>
      ) : appointments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-black/18 bg-white py-16 text-center text-black/65 shadow-sm dark:border-white/10 dark:bg-black dark:text-white/40">
          <CalendarClock className="h-8 w-8 opacity-20" />
          <span className="text-sm">No appointments in this range</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {appointments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-black/18 bg-black/5 dark:border-white/10 dark:bg-white/5">
                  <CalendarClock className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{formatDateTime(a.scheduledAt)}</span>
                  <span className="text-xs text-black/65 dark:text-white/45">
                    {/* Derived, not stored — a therapy day is kept as
                        "consultation" and reads as "Therapy · day 3 of 6". */}
                    {a.kindDetail ?? TYPE_LABELS[a.type] ?? a.type}
                    {a.doctorName ? ` · ${a.doctorName}` : ""}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-black/20 bg-black/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider dark:border-white/20 dark:bg-white/5">
                  {STATUS_LABELS[a.status] ?? a.status}
                </span>
                <Link
                  href={`/people/${patientId}/appointments/${a.id}`}
                  title="View"
                  aria-label="View"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/22 text-black transition hover:bg-black/5 dark:border-white/15 dark:text-white dark:hover:bg-white/5"
                >
                  <Eye className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewAppointmentModal
        open={modalOpen}
        patientId={patientId}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchAppointments}
      />
    </div>
  )
}

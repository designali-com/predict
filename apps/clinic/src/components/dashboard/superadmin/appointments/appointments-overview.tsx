"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ListPagination, type PageSize } from "@/src/components/dashboard/list-pagination"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { CalendarClock, Plus, Search, X } from "lucide-react"
import { displayName } from "@/src/lib/display-name"
import { Button } from "@workspace/ui/components/button"

interface AppointmentRow {
  id: string
  type: string
  scheduledAt: string
  status: string
  channel: string | null
  feeInPaise: number
  doctorName: string | null
  patientName: string | null
  patientPhone: string | null
  kindDetail?: string | null
  stage: string | null
  feePaid: boolean
  /** Cancelled or a no-show — the fee is not charged. */
  feeWaived?: boolean
  feeCollectedInPaise?: number
}

const TYPE_LABELS: Record<string, string> = {
  consultation: "Consultation",
  review: "Review",
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  in_consultation: "In consultation",
  completed: "Visited",
  cancelled: "Cancelled",
  no_show: "Not Visited",
}

const MODE_LABELS: Record<string, string> = {
  virtual: "Virtual",
  in_clinic: "Clinic",
}

type DateFilter = "upcoming" | "all" | "today" | "week" | "month" | "year" | "custom"

const FILTERS: { value: DateFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "all", label: "All" },
  { value: "week", label: "Last Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
]

function formatWhen(value: string) {
  const date = new Date(value)
  const day = date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
  return `${day} · ${time}`
}

const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/70",
  confirmed: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  in_consultation: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  no_show: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
}

const INPUT =
  "w-full rounded-full border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatPhone(phone: string | null) {
  if (!phone) return "—"
  const digits = phone.replace(/\D/g, "")
  if (digits.length >= 12 && digits.startsWith("91")) return digits.slice(-10)
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1)
  if (digits.length === 10) return digits
  return digits || phone
}

function formatFee(paise: number, paid: boolean, waived = false, collected = 0) {
  if (waived) {
    return collected > 0
      ? `${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(collected / 100)} paid`
      : "Not charged"
  }
  if ((paise ?? 0) === 0) return "Free"
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format((paise ?? 0) / 100)
  return paid ? `${amount} paid` : `${amount} due`
}

function modeLabel(channel: string | null) {
  if (!channel) return "—"
  return MODE_LABELS[channel] ?? channel.replace(/_/g, " ")
}

// The past ranges stop at now; "today" is the whole day, so the visits still
// to come this afternoon are on it; "upcoming" is from now on, with no end.
function computePresetRange(filter: DateFilter): { from: Date; to: Date | null } | null {
  const to = new Date()
  const from = new Date()

  switch (filter) {
    case "upcoming":
      return { from, to: null }
    case "today":
      from.setHours(0, 0, 0, 0)
      to.setHours(23, 59, 59, 999)
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

export function AppointmentsOverview() {
  const router = useRouter()
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [mode, setMode] = useState("all")
  // Opens on today — the day the desk is working — with what is coming up
  // one click away.
  const [filter, setFilter] = useState<DateFilter>("today")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()))

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return appointments.filter((a) => {
      if (status !== "all" && a.status !== status) return false
      if (mode !== "all" && a.channel !== mode) return false
      if (!q) return true
      return [a.patientName, a.patientPhone, a.doctorName, a.kindDetail, STATUS_LABELS[a.status], modeLabel(a.channel)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    })
  }, [appointments, query, status, mode])

  // Back to the first page whenever what is listed changes.
  const pages = Math.max(1, Math.ceil(shown.length / pageSize))
  const current = Math.min(page, pages)
  const pageRows = shown.slice((current - 1) * pageSize, current * pageSize)

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
      const params = new URLSearchParams()
      if (range?.from) params.set("from", range.from.toISOString())
      if (range?.to) params.set("to", range.to.toISOString())

      const res = await fetch(`/api/staff/appointments?${params}`)
      const data = await res.json()
      const rows: AppointmentRow[] = data.appointments ?? []
      // The API lists newest first. Coming up reads soonest first.
      setAppointments(
        filter === "upcoming" || filter === "today"
          ? [...rows].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
          : rows,
      )
    } catch {
      setAppointments([])
    } finally {
      setIsLoading(false)
    }
  }, [range, filter])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  return (
    <div className="flex w-full flex-col gap-3 px-4 pb-4 pt-2 text-black lg:px-6 lg:pb-6 lg:pt-3 dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Appointments</h1>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
          <div className="relative w-full min-w-[220px] sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/60 dark:text-white/40" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Name, mobile or doctor"
              className={`${INPUT} pl-9 pr-9`}
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <Button nativeButton={false} render={<Link href="/appointments/new" />} variant="simple">
            <Plus className="h-4 w-4" />
            Create
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setFilter(f.value)
                setPage(1)
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                filter === f.value
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "border border-black/15 text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/5"
              }`}
            >
              {f.label}
            </button>
          ))}
          {filter === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border border-black/18 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-black dark:text-white"
              />
              <span className="text-xs text-black/45 dark:text-white/40">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-black/18 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-black dark:text-white"
              />
            </div>
          )}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
            className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs text-black dark:border-white/15 dark:bg-black dark:text-white"
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            aria-label="Filter by mode"
            className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs text-black dark:border-white/15 dark:bg-black dark:text-white"
          >
            <option value="all">All modes</option>
            <option value="virtual">Virtual</option>
            <option value="in_clinic">Clinic</option>
          </select>
        </div>
        <span className="text-xs text-black/60 dark:text-white/40">
          {query || status !== "all" || mode !== "all"
            ? `${shown.length} of ${appointments.length}`
            : appointments.length}
        </span>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <PredictSpinner />
        </div>
      ) : appointments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-black/18 py-12 text-center text-sm text-black/50 dark:border-white/10 dark:text-white/40">
          <CalendarClock className="h-6 w-6 opacity-40" />
          No appointments in this range
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-md border border-black/18 py-12 text-center text-sm text-black/50 dark:border-white/10 dark:text-white/40">
          Nothing matches these filters
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-black/18 dark:border-white/10">
          <table className="w-full text-xs">
            <thead className="border-b border-black/18 bg-black/[0.02] text-left text-[11px] uppercase tracking-wide text-black/55 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/45">
              <tr>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">When</th>
                <th className="px-3 py-1.5 font-medium">Name</th>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Mobile</th>
                <th className="px-3 py-1.5 font-medium">Visit</th>
                <th className="px-3 py-1.5 font-medium">Doctor</th>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Mode</th>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Status</th>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Fee</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((a) => {
                const fee = formatFee(a.feeInPaise, a.feePaid, a.feeWaived, a.feeCollectedInPaise)
                const unpaid = !a.feeWaived && (a.feeInPaise ?? 0) > 0 && !a.feePaid
                return (
                  <tr
                    key={a.id}
                    onClick={() => router.push(`/appointments/${a.id}`)}
                    className="cursor-pointer border-b border-black/12 last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
                  >
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-black/70 dark:text-white/60">
                      {formatWhen(a.scheduledAt)}
                    </td>
                    <td className="max-w-[200px] px-3 py-1.5">
                      <span className="block truncate font-medium">{a.patientName ? displayName(a.patientName) : "Unknown"}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-black/60 dark:text-white/40">
                      {formatPhone(a.patientPhone)}
                    </td>
                    <td className="max-w-[180px] px-3 py-1.5">
                      <span className="block truncate">
                        {a.kindDetail ?? TYPE_LABELS[a.type] ?? a.type}
                      </span>
                    </td>
                    <td className="max-w-[160px] px-3 py-1.5 text-black/70 dark:text-white/60">
                      <span className="block truncate">{a.doctorName || "—"}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-black/60 dark:text-white/40">
                      {modeLabel(a.channel)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[a.status] ?? STATUS_TONE.scheduled}`}
                      >
                        {STATUS_LABELS[a.status] ?? a.status}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-1.5 tabular-nums ${
                        unpaid ? "text-amber-700 dark:text-amber-400" : "text-black/60 dark:text-white/40"
                      }`}
                    >
                      {fee}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {!isLoading && shown.length > 0 && (
        <ListPagination
          page={current}
          pageSize={pageSize}
          total={shown.length}
          onPage={setPage}
          onPageSize={(s) => {
            setPageSize(s)
            setPage(1)
          }}
        />
      )}
    </div>
  )
}

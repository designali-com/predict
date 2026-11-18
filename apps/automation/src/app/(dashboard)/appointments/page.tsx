"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, Search, X, CalendarDays, List } from "lucide-react"
import { PageHeader } from "@workspace/ui/components/page-header"

interface Row {
  id: string
  contactId: string
  contactName: string | null
  contactPhone: string | null
  contactStage: string | null
  doctorName: string | null
  type: string
  scheduledAt: string
  status: string
  channel: string | null
  notes: string | null
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  in_consultation: "bg-violet-100 text-violet-700",
  completed: "bg-muted/5 text-muted-foreground",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-amber-100 text-amber-700",
}

const STATUSES = ["scheduled", "confirmed", "in_consultation", "completed", "cancelled", "no_show"]

const selectClass =
  "rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"

function pad(n: number) {
  return String(n).padStart(2, "0")
}
/** Local calendar day — toISOString() renders UTC and names the wrong day. */
function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toLocalDateString(d)
}

export default function AppointmentsPage() {
  // useSearchParams needs a Suspense boundary above it — without one Next
  // refuses to prerender the route at build time.
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      }
    >
      <Appointments />
    </Suspense>
  )
}

/**
 * One screen, two questions.
 *
 * **Day** is a shift — who is walking in, in order, so the front desk can work
 * down it. **List** is a search — find that appointment, filter by state, look
 * at what is coming. Splitting them across two nav entries would have put the
 * same rows behind two doors; a toggle keeps it one place.
 */
function Appointments() {
  const searchParams = useSearchParams()
  const contactId = searchParams.get("contactId")

  // Arriving from a person means "show me theirs" — a day view of one
  // patient is almost always empty.
  const [view, setView] = useState<"day" | "list">(contactId ? "list" : "day")
  const [date, setDate] = useState(() => toLocalDateString(new Date()))
  const [when, setWhen] = useState(contactId ? "all" : "upcoming")
  const [status, setStatus] = useState("")
  const [search, setSearch] = useState("")

  const [rows, setRows] = useState<Row[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      // Server-side, always. Filtering a global page of results in the browser
      // silently loses any patient whose visits fall outside that page.
      if (contactId) params.set("contactId", contactId)
      if (view === "day") {
        // Half-open range over the local day: [00:00 today, 00:00 tomorrow).
        // Sent as an instant, not a bare "YYYY-MM-DDT00:00": the server runs in
        // UTC and would read that as 05:30 here.
        params.set("from", new Date(`${date}T00:00:00`).toISOString())
        params.set("to", new Date(`${addDays(date, 1)}T00:00:00`).toISOString())
      } else {
        params.set("when", when)
        if (status) params.set("status", status)
        if (search.trim()) params.set("q", search.trim())
      }
      const res = await fetch(`/api/appointments?${params.toString()}`)
      const data = await res.json().catch(() => null)
      setRows(data?.appointments ?? [])
      setTruncated(data?.truncated ?? false)
    } finally {
      setLoading(false)
    }
  }, [view, date, when, status, search, contactId])

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  const isToday = date === toLocalDateString(new Date())

  const counts = useMemo(() => {
    const active = rows.filter((r) => r.status !== "cancelled")
    return { total: active.length, cancelled: rows.length - active.length }
  }, [rows])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Appointments"
        description={
          view === "day"
            ? "Everyone coming in on one day, across every doctor."
            : "Search and filter every appointment on record."
        }
        actions={
        <div className="flex gap-1.5">
          {(
            [
              { key: "day", label: "Day", icon: CalendarDays },
              { key: "list", label: "List", icon: List },
            ] as const
          ).map((v) => (
            <Button
              key={v.key}
              onClick={() => setView(v.key)} variant={view === v.key ? "default" : "outline"}>
              <v.icon className="h-3.5 w-3.5" />
              {v.label}
            </Button>
          ))}
        </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {view === "day" ? (
          <>
            <Button
              onClick={() => setDate(addDays(date, -1))}
              aria-label="Previous day" size="icon-sm" variant="outline">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className={selectClass}
            />
            <Button
              onClick={() => setDate(addDays(date, 1))}
              aria-label="Next day" size="icon-sm" variant="outline">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button
                onClick={() => setDate(toLocalDateString(new Date()))} size="sm" variant="outline">
                Today
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or phone"
                className={`${selectClass} w-56 pl-8`}
              />
            </div>
            <select value={when} onChange={(e) => setWhen(e.target.value)} className={selectClass}>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
              <option value="all">All time</option>
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectClass}
            >
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </>
        )}

        {contactId && (
          <Button size="sm" nativeButton={false} render={<Link href="/appointments" />}>
            {rows[0]?.contactName ?? rows[0]?.contactPhone ?? "One person"}
            <X className="h-3 w-3" />
          </Button>
        )}

        <span className="text-xs text-muted-foreground">
          {counts.total} {view === "day" ? "booked" : "shown"}
          {counts.cancelled > 0 && ` · ${counts.cancelled} cancelled`}
          {truncated && " (capped at 200 — narrow the filters)"}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
          {view === "day" ? "Nothing booked for this day." : "No appointments match these filters."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map((r) => (
            <li key={r.id}>
              {/* The appointment, not the person: from a list of visits the
                  next thing is almost always marking attendance or moving it. */}
              <Link
                href={`/appointments/${r.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <span className="w-36 shrink-0 font-mono text-sm">
                  {view === "day"
                    ? new Date(r.scheduledAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : new Date(r.scheduledAt).toLocaleString([], {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {r.contactName ?? r.contactPhone ?? "Unnamed"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[r.type, r.doctorName, r.channel].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
                    STATUS_STYLE[r.status] ?? "bg-muted/5 text-muted-foreground"
                  }`}
                >
                  {r.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { CalendarClock, ChevronLeft, ChevronRight, MoreHorizontal, PenLine, Plus, Search, Settings2, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@workspace/ui/components/dropdown-menu"
import { displayName, shortPlanName } from "@/src/lib/display-name"
import { PredictSpinner } from "@/src/components/predict-loader"
import { RecordBadge, RecordSection } from "@/src/components/dashboard/patients/record-ui"
import { addDays, clinicNowHour, dayLabel, hourLabel, SlotGrid, useSlotWeek, type DayColumn, type Therapist, type WeekData } from "./slot-grid"
import { LogSittingDialog } from "./log-sitting-dialog"

interface Booking {
  id: string
  hour: number
  status: string
  note: string | null
  contactId: string
  name: string | null
  phone: string | null
  enrollmentId: string | null
  planName: string | null
  sittingsSold: number | null
  sittingsDone: number
  sittingId: string | null
  therapistId?: string | null
  therapistName?: string | null
}

interface Person {
  id: string
  name: string | null
  phone: string | null
  courses: { id: string; planName: string; status: string; sittings: number }[]
}

const STATUS: Record<string, { label: string; tone: "neutral" | "good" | "warn" | "bad" | "primary" }> = {
  booked: { label: "Booked", tone: "primary" },
  attended: { label: "Sitting logged", tone: "good" },
  no_show: { label: "Did not come", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "neutral" },
}

/** The dot before each name — the status at a glance; only a non-booked one also gets a word. */
const DOT: Record<string, string> = {
  booked: "bg-primary",
  attended: "bg-emerald-500",
  no_show: "bg-amber-500",
  cancelled: "bg-black/25 dark:bg-white/25",
}

/** "6 booked · 2 logged · 1 didn't come" — the day in one line. */
function daySummary(bookings: { status: string }[] | null): string {
  if (!bookings) return ""
  const n = (s: string) => bookings.filter((b) => b.status === s).length
  const parts = [
    `${n("booked")} booked`,
    n("attended") ? `${n("attended")} logged` : "",
    n("no_show") ? `${n("no_show")} didn't come` : "",
    n("cancelled") ? `${n("cancelled")} cancelled` : "",
  ].filter(Boolean)
  return bookings.length ? parts.join(" · ") : "Nobody booked yet — add patients hour by hour."
}

const phone10 = (p: string | null) => (p ? p.replace(/\D/g, "").slice(-10) : "")

/**
 * The therapy calendar: who is in which hour, and room for whom.
 *
 * Booked by the hour, not by therapist — the clinic treats so many patients at
 * once. A booking holds the place; the sitting is logged, and signed, when the
 * patient is actually treated. Somebody who walks in without a booking is
 * logged just the same.
 */
export function TherapyCalendar() {
  const [from, setFrom] = useState<string | null>(null)
  const { data, loading, reload } = useSlotWeek(from)
  const now = clinicNowHour()
  const [day, setDay] = useState(now.day)
  const [hour, setHour] = useState<number | null>(null)
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [adding, setAdding] = useState<number | null>(null)
  // Patient chosen for an hour, waiting for the therapist to be picked.
  const [choosing, setChoosing] = useState<{ hour: number; person: Person; courseId: string | null } | null>(null)
  const [walkIn, setWalkIn] = useState(false)
  const [logging, setLogging] = useState<{
    enrollmentId: string
    contactId: string
    name: string | null
    planName: string | null
    next: number
    total: number | null
    bookingId: string | null
  } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [moving, setMoving] = useState<Booking | null>(null)

  const loadDay = useCallback(async () => {
    const res = await fetch(`/api/staff/therapy-calendar?day=${day}`)
    const json = await res.json().catch(() => null)
    setBookings(res.ok ? json.bookings : [])
  }, [day])
  useEffect(() => {
    void loadDay()
  }, [loadDay])

  const refresh = async () => {
    await Promise.all([reload(), loadDay()])
  }

  async function setStatus(b: Booking, status: string) {
    const res = await fetch("/api/staff/therapy-calendar", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingId: b.id, status }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) toast.error(json?.error ?? "Could not change the booking")
    await refresh()
  }

  const column = data?.columns.find((c) => c.day === day) ?? null
  const hours = data ? Array.from({ length: data.settings.lastHour - data.settings.openHour + 1 }, (_, i) => data.settings.openHour + i) : []
  const start = from ?? data?.from ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={!start} onClick={() => start && setFrom(addDays(start, -7))} aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setFrom(null)
            setDay(now.day)
          }}
        >
          Today
        </Button>
        <Button size="sm" variant="outline" disabled={!start} onClick={() => start && setFrom(addDays(start, 7))} aria-label="Next week">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <input
          type="date"
          value={day}
          onChange={(e) => {
            if (!e.target.value) return
            setDay(e.target.value)
            setFrom(e.target.value)
          }}
          className="h-8 rounded-md border border-black/18 bg-white px-2 text-sm dark:border-white/10 dark:bg-black"
        />
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => setWalkIn(true)}>
            <PenLine className="h-4 w-4" /> Log a sitting
          </Button>
          {data?.canEdit && (
            <Button size="sm" variant="outline" onClick={() => setSettingsOpen((o) => !o)}>
              <Settings2 className="h-4 w-4" /> Hours & holidays
            </Button>
          )}
        </div>
      </div>

      {settingsOpen && data && <ScheduleSettingsPanel data={data} onSaved={refresh} />}

      {loading || !data ? (
        <div className="flex justify-center py-10">
          <PredictSpinner className="size-5" />
        </div>
      ) : (
        <SlotGrid
          columns={data.columns}
          capacity={data.settings.capacity}
          selected={hour != null ? { day, hour } : null}
          onPick={(d, h) => {
            setDay(d)
            setHour(h)
          }}
        />
      )}

      <RecordSection
        title={`${dayLabel(day)}${day === now.day ? " · today" : ""}`}
        icon={CalendarClock}
        description={column?.closed ? `Closed — ${column.reason ?? "no therapy"}` : daySummary(bookings)}
      >
        {bookings == null ? (
          <div className="flex justify-center py-6">
            <PredictSpinner className="size-5" />
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06] overflow-hidden rounded-lg border border-black/10 dark:divide-white/[0.06] dark:border-white/10">
            {hours.map((h) => {
              const inHour = bookings.filter((b) => b.hour === h)
              const holding = inHour.filter((b) => b.status === "booked" || b.status === "attended").length
              const capacity = data?.settings.capacity ?? 0
              const free = Math.max(0, capacity - holding)
              const gone = day < now.day || (day === now.day && h < now.hour)
              // Earlier hours of today stay bookable — a patient entered after they came in.
              const canAdd = !column?.closed && day >= now.day && free > 0
              return (
                <div
                  key={h}
                  className={`grid grid-cols-[4.25rem_1fr_auto] gap-x-2 px-2.5 py-1.5 ${hour === h ? "bg-primary/[0.04]" : ""} ${gone && inHour.length === 0 ? "opacity-50" : ""}`}
                >
                  {/* The hour, and how much room is left in it. */}
                  <div className="pt-0.5">
                    <p className="text-[13px] font-semibold tabular-nums leading-tight">{hourLabel(h)}</p>
                    <p className={`text-[10.5px] leading-tight ${free === 0 && !column?.closed ? "text-red-600" : "text-black/45 dark:text-white/35"}`}>
                      {column?.closed ? "Closed" : free === 0 ? "Full" : `${free}/${capacity} free`}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <ul className="flex flex-col">
                      {inHour.map((b) => {
                        const st = STATUS[b.status] ?? { label: b.status, tone: "neutral" as const }
                        const canLog = b.status === "booked" && b.enrollmentId && day === now.day
                        const off = b.status === "cancelled" || b.status === "no_show"
                        return (
                          <li key={b.id} className="flex min-h-7 items-center gap-2 text-[13px]">
                            <span className={`size-1.5 shrink-0 rounded-full ${DOT[b.status] ?? "bg-black/30"}`} title={st.label} />
                            <Link
                              href={`/people/${b.contactId}`}
                              title={phone10(b.phone) || undefined}
                              className={`truncate font-medium hover:underline ${off ? "text-black/45 line-through dark:text-white/35" : ""}`}
                            >
                              {b.name ? displayName(b.name) : "Unknown"}
                            </Link>
                            <span className="hidden shrink-0 text-[11px] text-black/50 sm:inline dark:text-white/40">
                              {b.therapistName ?? "No therapist"}
                            </span>
                            {b.planName ? (
                              <span className="hidden min-w-0 truncate text-[11px] text-black/45 md:inline dark:text-white/35">
                                {shortPlanName(b.planName)} · {b.sittingsDone}/{b.sittingsSold}
                              </span>
                            ) : (
                              <span className="hidden shrink-0 text-[11px] text-amber-700 md:inline dark:text-amber-400">No course</span>
                            )}
                            {b.status !== "booked" && <RecordBadge tone={st.tone}>{st.label}</RecordBadge>}

                            <div className="ml-auto flex shrink-0 items-center gap-0.5">
                              {canLog && (
                                <Button
                                  size="sm"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() =>
                                    setLogging({
                                      enrollmentId: b.enrollmentId!,
                                      contactId: b.contactId,
                                      name: b.name,
                                      planName: b.planName,
                                      next: b.sittingsDone + 1,
                                      total: b.sittingsSold,
                                      bookingId: b.id,
                                    })
                                  }
                                >
                                  <PenLine className="h-3 w-3" /> Log
                                </Button>
                              )}
                              {(b.status === "booked" || b.status === "no_show" || (off && !gone)) && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" aria-label="More">
                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                      </Button>
                                    }
                                  />
                                  <DropdownMenuContent align="end">
                                    {/* Booked, or did not come: either can be moved to another hour. */}
                                    {(b.status === "booked" || b.status === "no_show") && (
                                      <DropdownMenuItem onClick={() => setMoving(b)}>
                                        <CalendarClock className="h-3.5 w-3.5" /> Reschedule…
                                      </DropdownMenuItem>
                                    )}
                                    {b.status === "booked" ? (
                                      <>
                                        <DropdownMenuItem onClick={() => setStatus(b, "no_show")}>Didn&apos;t come</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setStatus(b, "cancelled")}>Cancel booking</DropdownMenuItem>
                                      </>
                                    ) : (
                                      !gone && <DropdownMenuItem onClick={() => setStatus(b, "booked")}>Undo — back to booked</DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>

                    {inHour.length === 0 && <p className="min-h-7 pt-1 text-[12px] text-black/30 dark:text-white/25">—</p>}

                    {adding === h && (
                      <div className="my-1.5">
                        <PatientPicker
                          placeholder={`Book into ${hourLabel(h)} — name or mobile`}
                          onCancel={() => setAdding(null)}
                          onPick={(person, courseId) => {
                            // Next: who treats them. Booking waits for that.
                            setChoosing({ hour: h, person, courseId })
                            setAdding(null)
                          }}
                        />
                      </div>
                    )}
                    {choosing?.hour === h && (
                      <TherapistChooser
                        therapists={data?.therapists ?? []}
                        busyIds={inHour.filter((b) => b.status === "booked" || b.status === "attended").map((b) => b.therapistId).filter((x): x is string => Boolean(x))}
                        patientName={choosing.person.name}
                        onCancel={() => setChoosing(null)}
                        onBook={async (therapistId) => {
                          const res = await fetch("/api/staff/therapy-calendar", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ action: "book", contactId: choosing.person.id, enrollmentId: choosing.courseId, day, hour: h, therapistId }),
                          })
                          const json = await res.json().catch(() => null)
                          if (!res.ok) {
                            toast.error(json?.error ?? "Could not book")
                            return
                          }
                          const who = (data?.therapists ?? []).find((x) => x.id === therapistId)?.name
                          toast.success(`${choosing.person.name ?? "Patient"} booked at ${hourLabel(h)}${who ? ` with ${who}` : ""}`)
                          setChoosing(null)
                          await refresh()
                        }}
                      />
                    )}
                  </div>

                  {/* Room in this hour: book somebody into it. */}
                  <div className="pt-0.5">
                    {canAdd && adding !== h && choosing?.hour !== h && (
                      <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={() => setAdding(h)}>
                        <Plus className="h-3 w-3" /> Add
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </RecordSection>

      {walkIn && (
        <WalkInPicker
          onClose={() => setWalkIn(false)}
          onPick={(person, course) => {
            setWalkIn(false)
            setLogging({
              enrollmentId: course.id,
              contactId: person.id,
              name: person.name,
              planName: course.planName,
              next: course.done + 1,
              total: course.sittings,
              bookingId: null,
            })
          }}
        />
      )}

      {moving && data && (
        <RescheduleDialog
          booking={moving}
          fromDay={day}
          today={now.day}
          therapists={data.therapists ?? []}
          onClose={() => setMoving(null)}
          onMoved={async () => {
            setMoving(null)
            await refresh()
          }}
        />
      )}

      {logging && (
        <LogSittingDialog
          enrollmentId={logging.enrollmentId}
          contactId={logging.contactId}
          patientName={logging.name}
          planName={logging.planName}
          nextNumber={logging.next}
          total={logging.total}
          bookingId={logging.bookingId}
          onClose={() => setLogging(null)}
          onLogged={refresh}
        />
      )}
    </div>
  )
}

/** Find a patient by name or mobile, then (if they have one) their running course. */
function PatientPicker({
  placeholder,
  onPick,
  onCancel,
}: {
  placeholder: string
  onPick: (person: Person, courseId: string | null) => void | Promise<void>
  onCancel: () => void
}) {
  const [q, setQ] = useState("")
  const [people, setPeople] = useState<Person[] | null>(null)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setPeople(null)
      return
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/staff/therapy-calendar?q=${encodeURIComponent(term)}`)
      const json = await res.json().catch(() => null)
      setPeople(res.ok ? json.people : [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="rounded-md border border-black/10 p-2 dark:border-white/10">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-black/40" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="h-8 w-full rounded-md border border-black/15 bg-white pl-7 pr-2 text-sm dark:border-white/10 dark:bg-black"
          />
        </div>
        <Button size="sm" variant="ghost" onClick={onCancel} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {people && (
        <ul className="mt-2 max-h-60 overflow-y-auto">
          {people.length === 0 && <li className="px-2 py-1.5 text-xs text-black/50">Nobody matches.</li>}
          {people.map((p) => {
            const running = p.courses.find((c) => c.status === "active") ?? null
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => void onPick(p, running?.id ?? null)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="font-medium">{p.name ?? "Unknown"}</span>
                  <span className="text-xs tabular-nums text-black/50">{phone10(p.phone)}</span>
                  <span className="ml-auto text-xs text-black/55 dark:text-white/40">
                    {running ? running.planName : p.courses.length ? "Course not started" : "No course"}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** "Log a sitting" for someone who came without a booking. */
function WalkInPicker({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (person: Person, course: { id: string; planName: string; sittings: number; done: number }) => void
}) {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]">
      <div className="w-full max-w-md rounded-md border border-border bg-background p-4 shadow-lg">
        <h2 className="mb-1 text-sm font-semibold">Log a sitting</h2>
        <p className="mb-3 text-xs text-muted-foreground">For a patient who came in without a booking. Their running course gets today's sitting.</p>
        <PatientPicker
          placeholder="Name or mobile"
          onCancel={onClose}
          onPick={async (person, courseId) => {
            if (!courseId) {
              setError(`${person.name ?? "This patient"} has no running course — start one from their record first.`)
              return
            }
            const res = await fetch(`/api/staff/enrollments?contactId=${person.id}`)
            const json = await res.json().catch(() => null)
            const course = (json?.enrollments ?? []).find((e: { enrollment: { id: string } }) => e.enrollment.id === courseId)
            const c = person.courses.find((x) => x.id === courseId)!
            onPick(person, { id: c.id, planName: c.planName, sittings: c.sittings, done: course?.progress?.done ?? 0 })
          }}
        />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Admin: the therapy hours, places per hour, weekly closed days and holidays. */
function ScheduleSettingsPanel({ data, onSaved }: { data: WeekData; onSaved: () => Promise<void> }) {
  const [openHour, setOpenHour] = useState(data.settings.openHour)
  const [lastHour, setLastHour] = useState(data.settings.lastHour)
  const [capacity, setCapacity] = useState(data.settings.capacity)
  const [closed, setClosed] = useState<number[]>(data.settings.closedWeekdays)
  const [holiday, setHoliday] = useState({ day: "", reason: "" })
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const res = await fetch("/api/staff/therapy-calendar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ openHour, lastHour, capacity, closedWeekdays: closed }),
    })
    const json = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) return toast.error(json?.error ?? "Could not save")
    toast.success("Therapy hours saved")
    await onSaved()
  }

  async function dayAction(action: "close" | "reopen", day: string, reason?: string) {
    const res = await fetch("/api/staff/therapy-calendar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, day, reason }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) return toast.error(json?.error ?? "Could not save")
    setHoliday({ day: "", reason: "" })
    await onSaved()
  }

  const hourOptions = Array.from({ length: 16 }, (_, i) => i + 6)
  const SELECT = "h-8 rounded-md border border-black/15 bg-white px-2 text-sm dark:border-white/10 dark:bg-black"
  return (
    <RecordSection title="Therapy hours & holidays" icon={Settings2}>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="grid gap-1">
          First hour
          <select value={openHour} onChange={(e) => setOpenHour(Number(e.target.value))} className={SELECT}>
            {hourOptions.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          Last hour
          <select value={lastHour} onChange={(e) => setLastHour(Number(e.target.value))} className={SELECT}>
            {hourOptions.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          Patients an hour
          <input type="number" min={1} max={50} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className={`${SELECT} w-20`} />
        </label>
        <div className="grid gap-1">
          Closed every
          <div className="flex gap-1">
            {WEEKDAYS.map((w, i) => (
              <button
                key={w}
                type="button"
                onClick={() => setClosed((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]))}
                className={`h-8 rounded-md border px-2 ${closed.includes(i) ? "border-red-400 bg-red-500/10 text-red-700" : "border-black/15 dark:border-white/10"}`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save hours"}
        </Button>
      </div>

      <div className="mt-4 border-t border-black/[0.06] pt-3 dark:border-white/[0.06]">
        <p className="mb-2 text-xs font-medium">Holidays (festivals and other days without therapy)</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={holiday.day} onChange={(e) => setHoliday({ ...holiday, day: e.target.value })} className={SELECT} />
          <input value={holiday.reason} onChange={(e) => setHoliday({ ...holiday, reason: e.target.value })} placeholder="Diwali" className={`${SELECT} w-40`} />
          <Button size="sm" variant="outline" disabled={!holiday.day} onClick={() => dayAction("close", holiday.day, holiday.reason)}>
            <Plus className="h-3.5 w-3.5" /> Add holiday
          </Button>
        </div>
        {data.holidays.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {data.holidays.map((h) => (
              <li key={h.id} className="flex items-center gap-1 rounded-md bg-black/[0.04] px-2 py-1 text-xs dark:bg-white/[0.06]">
                {dayLabel(h.day)}
                {h.reason ? ` · ${h.reason}` : ""}
                <button type="button" onClick={() => dayAction("reopen", h.day)} aria-label={`Open ${h.day} again`} className="ml-1 text-black/40 hover:text-black">
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </RecordSection>
  )
}

/**
 * Who treats them, picked after the patient: the clinic's therapists, the ones
 * already with somebody that hour struck through. Nobody picked means the first
 * free one.
 */
function TherapistChooser({
  therapists,
  busyIds,
  patientName,
  onBook,
  onCancel,
}: {
  therapists: { id: string; name: string; gender: string | null }[]
  busyIds: string[]
  patientName: string | null
  onBook: (therapistId: string | null) => void | Promise<void>
  onCancel: () => void
}) {
  const busy = new Set(busyIds)
  const free = therapists.filter((t) => !busy.has(t.id))
  const [picked, setPicked] = useState<string | null>(free[0]?.id ?? null)
  const [saving, setSaving] = useState(false)

  return (
    <div className="mt-2 rounded-md border border-primary/30 bg-primary/[0.03] p-2.5">
      <p className="mb-2 text-xs">
        <span className="font-medium">{patientName ?? "Patient"}</span>
        <span className="text-black/55 dark:text-white/45"> — with which therapist?</span>
      </p>
      {therapists.length === 0 ? (
        <p className="text-xs text-black/55 dark:text-white/45">No therapists listed for this clinic — the booking is made without one.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {therapists.map((t) => {
            const taken = busy.has(t.id)
            const on = picked === t.id
            return (
              <button
                key={t.id}
                type="button"
                disabled={taken}
                onClick={() => setPicked(t.id)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : taken
                      ? "cursor-not-allowed border-dashed text-black/40 line-through dark:text-white/30"
                      : "border-black/15 hover:border-primary dark:border-white/15"
                }`}
              >
                {t.name}
                {t.gender && <span className="ml-1 text-[11px] opacity-70">{t.gender === "female" ? "F" : "M"}</span>}
                {taken && <span className="ml-1 text-[11px]">· booked</span>}
              </button>
            )
          })}
        </div>
      )}
      <div className="mt-2.5 flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 px-3 text-xs"
          disabled={saving || (therapists.length > 0 && free.length === 0)}
          onClick={async () => {
            setSaving(true)
            try {
              await onBook(picked)
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? "Booking…" : "Book"}
        </Button>
      </div>
    </div>
  )
}

/**
 * Move a booking to another day and hour. The day's free places come from the
 * same grid the calendar draws; the server checks again when it books.
 * The therapist stays the same when they are free in the new hour.
 */
function RescheduleDialog({
  booking,
  fromDay,
  today,
  therapists,
  onClose,
  onMoved,
}: {
  booking: Booking
  fromDay: string
  today: string
  therapists: Therapist[]
  onClose: () => void
  onMoved: () => void | Promise<void>
}) {
  const [toDay, setToDay] = useState(fromDay < today ? today : fromDay)
  const [column, setColumn] = useState<DayColumn | null | undefined>(undefined)
  const [hour, setHour] = useState<number | null>(null)
  const [therapistId, setTherapistId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const now = clinicNowHour()

  useEffect(() => {
    setColumn(undefined)
    setHour(null)
    fetch(`/api/staff/therapy-calendar?days=1&from=${toDay}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WeekData | null) => setColumn(d?.columns.find((c) => c.day === toDay) ?? null))
      .catch(() => setColumn(null))
  }, [toDay])

  const slot = column?.slots.find((s) => s.hour === hour) ?? null
  const busyIds = new Set(slot?.busyTherapistIds ?? [])
  const isSame = (h: number) => toDay === fromDay && h === booking.hour

  const pickHour = (h: number) => {
    setHour(h)
    const s = column?.slots.find((x) => x.hour === h)
    const taken = new Set(s?.busyTherapistIds ?? [])
    // Keep their therapist if free then; otherwise the first one who is.
    const keep = booking.therapistId && !taken.has(booking.therapistId) ? booking.therapistId : null
    setTherapistId(keep ?? therapists.find((t) => !taken.has(t.id))?.id ?? null)
  }

  async function move() {
    if (hour == null) return
    setBusy(true)
    const res = await fetch("/api/staff/therapy-calendar", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reschedule", bookingId: booking.id, day: toDay, hour, therapistId }),
    })
    const json = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) {
      toast.error(json?.error ?? "Could not reschedule")
      return
    }
    const who = therapists.find((t) => t.id === therapistId)?.name
    toast.success(`${booking.name ? displayName(booking.name) : "Patient"} moved to ${dayLabel(toDay)}, ${hourLabel(hour)}${who ? ` with ${who}` : ""}`)
    await onMoved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule {booking.name ? displayName(booking.name) : "booking"}</DialogTitle>
          <DialogDescription>
            Now {dayLabel(fromDay)}, {hourLabel(booking.hour)}
            {booking.therapistName ? ` with ${booking.therapistName}` : ""}. Pick the new day and hour — the old booking is cancelled.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">New day</span>
          <input
            type="date"
            value={toDay}
            min={today}
            onChange={(e) => e.target.value && setToDay(e.target.value)}
            className="h-9 rounded-md border border-black/18 bg-white px-2 text-sm dark:border-white/10 dark:bg-black"
          />
        </label>

        <div>
          <p className="mb-1.5 text-sm font-medium">Hour</p>
          {column === undefined ? (
            <div className="flex justify-center py-4">
              <PredictSpinner className="size-5" />
            </div>
          ) : !column || column.closed ? (
            <p className="text-sm text-muted-foreground">Closed{column?.reason ? ` — ${column.reason}` : ""}. Pick another day.</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              {column.slots.map((s) => {
                const gone = toDay === now.day && s.hour < now.hour
                const disabled = gone || s.free === 0 || isSame(s.hour)
                return (
                  <button
                    key={s.hour}
                    type="button"
                    disabled={disabled}
                    onClick={() => pickHour(s.hour)}
                    className={`rounded-md border px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      hour === s.hour ? "border-primary bg-primary/10" : "border-border hover:border-ring"
                    }`}
                  >
                    <span className="block text-[13px] font-semibold tabular-nums">{hourLabel(s.hour)}</span>
                    <span className={`block text-[10.5px] ${s.free === 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {isSame(s.hour) ? "Current" : s.free === 0 ? "Full" : `${s.free} free`}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {hour != null && therapists.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium">Therapist</p>
            <div className="flex flex-wrap gap-1.5">
              {therapists.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busyIds.has(t.id)}
                  onClick={() => setTherapistId(t.id)}
                  className={`rounded-md border px-2.5 py-1 text-[13px] disabled:cursor-not-allowed disabled:opacity-40 ${
                    therapistId === t.id ? "border-primary bg-primary/10 font-medium" : "border-border hover:border-ring"
                  }`}
                >
                  {t.name}
                  {busyIds.has(t.id) ? " · busy" : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={move} disabled={busy || hour == null}>
            {busy && <PredictSpinner className="size-4" />}
            {hour == null ? "Pick an hour" : `Move to ${dayLabel(toDay)}, ${hourLabel(hour)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

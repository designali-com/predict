"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { rampColor } from "@workspace/db/care-plan"
import { toast } from "@workspace/ui/components/sonner"
import {
  BookAppointmentDialog,
  APPOINTMENT_TYPES,
  CHANNELS,
} from "@/src/components/book-appointment-dialog"
import { Plus, CheckCircle2, ChevronRight, CalendarPlus, CalendarCheck, Clock, Stethoscope, MapPin, Video } from "lucide-react"

interface Appointment {
  id: string
  type: string
  scheduledAt: string
  status: string
  notes: string | null
  doctorUserId: string | null
  channel: string | null
}
interface TaskRow {
  id: string
  title: string
  assignedRole: string | null
  assignedUserName: string | null
  dueAt: string | null
  status: string
}
interface Doctor {
  id: string
  name: string
  email: string
}

/** How many rows show inline before the rest go behind a link. */
const TASK_PREVIEW = 3
const HISTORY_PREVIEW = 4

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-2 text-sm focus:border-ring focus:outline-none"

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  completed: "bg-muted/5 text-muted-foreground",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-amber-100 text-amber-700",
}

/**
 * The first screen anyone opens on a person, and it is shaped for whoever
 * opens it most: the front desk, mid-phone-call.
 *
 * The appointment answer — "when are they next in, and if never, book them
 * now" — is the question behind almost every inbound call, so it sits at the
 * top. Tasks and adherence are real work but nobody phones in about them, so
 * they share one row underneath. Stage and call outcomes live in the side
 * column of the page, beside every tab.
 */
export function OverviewTab({
  contactId,
  appointments: showAppointments = true,
}: {
  contactId: string
  /** False where the clinic takes no appointments (Predict): no booking card. */
  appointments?: boolean
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [adherence, setAdherence] = useState<{
    overall: number
    days: number
    activeItems: number
    recent: { date: string; expected: number; completed: number; rate: number | null }[]
  } | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [bookOpen, setBookOpen] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)

  const [taskForm, setTaskForm] = useState({ title: "", assignedRole: "health_coach", dueAt: "" })

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/appointments?contactId=${contactId}`).then((r) => r.json()),
      fetch(`/api/tasks?contactId=${contactId}`).then((r) => r.json()),
      fetch(`/api/contacts/${contactId}/adherence`).then((r) => r.json()),
      fetch(`/api/contacts/${contactId}/care-plan`).then((r) => r.json()),
      fetch("/api/staff/doctors").then((r) => r.json()),
    ])
      .then(([apptData, taskData, adherenceData, planData, doctorData]) => {
        setAppointments(apptData.appointments ?? [])
        setTasks(taskData.tasks ?? [])
        setDoctors(doctorData.doctors ?? [])

        const calendar = adherenceData?.calendar ?? []
        const activeItems = (planData?.items ?? []).filter(
          (i: { isActive: boolean }) => i.isActive,
        ).length
        // No plan means no denominator, so there is no percentage to show —
        // deliberately null rather than 0%, which would read as total failure.
        setAdherence(
          adherenceData?.overall === null || adherenceData?.overall === undefined
            ? null
            : {
                overall: adherenceData.overall,
                days: calendar.length,
                activeItems,
                recent: calendar.slice(-14),
              },
        )
      })
      .finally(() => setLoading(false))
  }, [contactId])

  useEffect(load, [load])

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const live = appointments.filter(
      (a) => a.status !== "cancelled" && new Date(a.scheduledAt).getTime() >= now,
    )
    return {
      // Soonest first — "next appointment" is the one the caller means.
      upcoming: [...live].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      ),
      past: appointments.filter((a) => !live.includes(a)),
    }
  }, [appointments])

  // Open ones first, then a hard cap. This is a person's page, not the queue:
  // an unbounded list here grows until it buries everything below it.
  const openTasks = useMemo(() => tasks.filter((t) => t.status === "open"), [tasks])
  const visibleTasks = useMemo(
    () => [...openTasks, ...tasks.filter((t) => t.status !== "open")].slice(0, TASK_PREVIEW),
    [openTasks, tasks],
  )
  const hiddenTaskCount = tasks.length - visibleTasks.length

  // Same reasoning as the task cap: a long-standing patient's full visit
  // history belongs on the appointments page, not stretching this card.
  const visiblePast = useMemo(() => past.slice(0, HISTORY_PREVIEW), [past])
  const hiddenPastCount = past.length - visiblePast.length

  const next = upcoming[0]
  const doctorName = (id: string | null) => doctors.find((d) => d.id === id)?.name ?? null

  const createTask = async () => {
    if (!taskForm.title) return
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId, ...taskForm }),
    })
    if (res.ok) toast.success("Task created")
    else {
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? "Couldn't create the task")
    }
    setTaskForm({ title: "", assignedRole: "health_coach", dueAt: "" })
    setShowTaskForm(false)
    load()
  }

  const markTaskDone = async (taskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    })
    if (res.ok) toast.success("Task completed")
    else {
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? "Couldn't update the task")
    }
    load()
  }

  if (loading) {
    return (
      <div className="flex w-full items-center justify-center py-16">
        <PredictSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Row 1 — the appointment answer, beside the outcomes only a person
          can record. Not shown where the clinic takes no appointments. */}
      {showAppointments && (
      <div>
        <div className="space-y-4">
          {next ? (
            <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <CalendarCheck className="h-3.5 w-3.5" />
                Next appointment
              </p>
              <Link
                href={`/appointments/${next.id}`}
                className="mt-1.5 block text-xl font-semibold hover:underline"
              >
                {new Date(next.scheduledAt).toLocaleString([], {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {APPOINTMENT_TYPES.find((t) => t.value === next.type)?.label ?? next.type}
                </span>
                <span className="flex items-center gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                  {doctorName(next.doctorUserId) ?? "No doctor assigned"}
                </span>
                {next.channel && (
                  <span className="flex items-center gap-1.5">
                    {next.channel === "virtual" ? (
                      <Video className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {CHANNELS.find((c) => c.value === next.channel)?.label ?? next.channel}
                  </span>
                )}
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] ${
                    STATUS_STYLE[next.status] ?? "bg-muted/5 text-muted-foreground"
                  }`}
                >
                  {next.status}
                </span>
              </div>
              {upcoming.length > 1 && (
                <p className="mt-2 text-xs text-muted-foreground">+{upcoming.length - 1} more upcoming</p>
              )}
              <Button
                onClick={() => setBookOpen(true)} variant="outline" className="mt-4">
                <CalendarPlus className="h-4 w-4" />
                Book another
              </Button>

          {past.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Earlier visits
                </h3>
                <Link
                  href={`/appointments?contactId=${contactId}`}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  All {past.length}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <ul className="divide-y divide-border">
                {visiblePast.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/appointments/${a.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted"
                    >
                      <span className="w-32 shrink-0 text-muted-foreground">
                        {new Date(a.scheduledAt).toLocaleString([], {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {APPOINTMENT_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                        {doctorName(a.doctorUserId) && ` · ${doctorName(a.doctorUserId)}`}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
                          STATUS_STYLE[a.status] ?? "bg-muted/5 text-muted-foreground"
                        }`}
                      >
                        {a.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {hiddenPastCount > 0 && (
                <Link
                  href={`/appointments?contactId=${contactId}`}
                  className="mt-1.5 block text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  +{hiddenPastCount} older
                </Link>
              )}
            </div>
          )}
            </section>
          ) : (
            <section className="rounded-lg border border-border p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarCheck className="h-3.5 w-3.5" />
                Next appointment
              </p>
              <p className="mt-1.5 text-base font-medium">Nothing booked</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Booking one moves them out of nurture — no further automated nudges go out while an
                appointment stands.
              </p>
              <Button
                onClick={() => setBookOpen(true)} className="mt-3 transition-opacity">
                <CalendarPlus className="h-4 w-4" />
                Book appointment
              </Button>

          {past.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Earlier visits
                </h3>
                <Link
                  href={`/appointments?contactId=${contactId}`}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  All {past.length}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <ul className="divide-y divide-border">
                {visiblePast.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/appointments/${a.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted"
                    >
                      <span className="w-32 shrink-0 text-muted-foreground">
                        {new Date(a.scheduledAt).toLocaleString([], {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {APPOINTMENT_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                        {doctorName(a.doctorUserId) && ` · ${doctorName(a.doctorUserId)}`}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
                          STATUS_STYLE[a.status] ?? "bg-muted/5 text-muted-foreground"
                        }`}
                      >
                        {a.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {hiddenPastCount > 0 && (
                <Link
                  href={`/appointments?contactId=${contactId}`}
                  className="mt-1.5 block text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  +{hiddenPastCount} older
                </Link>
              )}
            </div>
          )}
            </section>
          )}
        </div>

      </div>
      )}

      {/* Row 2 — two short cards side by side rather than a tall stack.
          Neither is why this page gets opened. */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tasks{" "}
              {openTasks.length > 0 && (
                <span className="text-muted-foreground">({openTasks.length} open)</span>
              )}
            </h2>
            <Link
              href={`/tasks?contactId=${contactId}`}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              All
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {visibleTasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-border px-2.5 py-2"
                >
                  <span className="min-w-0">
                    <Link href={`/tasks/${t.id}`} className="block truncate hover:underline">
                      {t.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {t.assignedUserName ?? t.assignedRole ?? "unassigned"}
                      {t.dueAt && ` · due ${new Date(t.dueAt).toLocaleDateString()}`}
                    </span>
                  </span>
                  {t.status === "open" ? (
                    <Button
                      onClick={() => markTaskDone(t.id)}
                      title="Mark done"
                      aria-label="Mark done" variant="ghost" className="text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">{t.status}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {hiddenTaskCount > 0 && (
            <Link
              href={`/tasks?contactId=${contactId}`}
              className="mt-2 block text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              +{hiddenTaskCount} more
            </Link>
          )}

          {/* mt-auto keeps the button on the card's floor, so this card and
              the one beside it stay level whatever is in them. */}
          <div className="mt-auto pt-3">
            {showTaskForm ? (
              <div className="space-y-2 border-t border-border pt-3">
                <input
                  placeholder="New task, e.g. Health coach call"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <select
                    value={taskForm.assignedRole}
                    onChange={(e) => setTaskForm({ ...taskForm, assignedRole: e.target.value })}
                    className={inputClass}
                  >
                    <option value="health_coach">Health Coach</option>
                    <option value="doctor">Doctor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <input
                    type="date"
                    value={taskForm.dueAt}
                    onChange={(e) => setTaskForm({ ...taskForm, dueAt: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={createTask}
                    disabled={!taskForm.title} className="flex-1">
                    <Plus className="h-3.5 w-3.5" />
                    Add task
                  </Button>
                  <Button
                    onClick={() => setShowTaskForm(false)} variant="outline">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => setShowTaskForm(true)} variant="outline" className="h-auto w-full justify-start whitespace-normal text-left w-full">
                <Plus className="h-3.5 w-3.5" />
                Add task
              </Button>
            )}
          </div>
        </section>

        {/* A summary, not a control. Logging a dose means naming which
            prescribed item and which time of day, and that belongs on the
            adherence page where the plan is — a bare "medication / done"
            dropdown here could never say what was taken. */}
        <section className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Adherence
            </h2>
            <Link
              href={`/contacts/${contactId}/adherence`}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Open
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {adherence === null ? (
            <p className="text-sm text-muted-foreground">
              Nothing prescribed yet — assign supplements, medication or exercise to start
              tracking.
            </p>
          ) : (
            <>
              <p className="text-2xl font-semibold">{Math.round(adherence.overall * 100)}%</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                last {adherence.days} days · {adherence.activeItems} active item
                {adherence.activeItems === 1 ? "" : "s"}
              </p>
              <div className="mt-3 flex gap-1">
                {adherence.recent.map((d) => (
                  <span
                    key={d.date}
                    title={`${d.date} — ${
                      d.expected === 0 ? "nothing due" : `${d.completed} of ${d.expected}`
                    }`}
                    style={{ backgroundColor: rampColor(d.rate) }}
                    className="h-6 flex-1 rounded-sm border border-border"
                  />
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Last 14 days, darker means more doses taken.
              </p>
            </>
          )}
        </section>
      </div>

      <BookAppointmentDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        contactId={contactId}
        doctors={doctors}
        onBooked={load}
      />
    </div>
  )
}

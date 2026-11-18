"use client"

import { useCallback, useEffect, useState } from "react"
import { Activity, Check, Home, Hospital, Loader2, Undo2, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { describePlan, formatPrice } from "@workspace/db/treatment-plan"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Sitting {
  id: string
  dayNumber: number
  plannedDate: string
  mode: string
  status: string
  completedAt: string | null
  loggedSource: string | null
  note: string | null
}

interface BillItem {
  id: string
  kind: string
  name: string
  rateInPaise: number
  quantity: number
  isExtra: boolean
}

interface Course {
  items: BillItem[]
  billing: { packageInPaise: number; extrasInPaise: number; totalInPaise: number }
  enrollment: {
    id: string
    planName: string
    limbs: string
    durationDays: number
    sittings: number
    priceInPaise: number
    startDate: string | null
    activatedAt: string | null
    status: string
    isPerSession?: boolean
  }
  sittings: Sitting[]
}

/** One day of the course, as the calendar shows it. */
interface Day {
  date: string
  /** Which sitting this was, on a day one was done — "Sitting 5". */
  n: number | null
  /** "rest": a day without a sitting on a course whose sittings are all given — not missed. */
  state: "done" | "missed" | "rest" | "today" | "upcoming"
  where: "clinic" | "home" | null
  /** The patient's own entry for the day — theirs to undo, unless the clinic has recorded the day. */
  mine: Sitting | null
  /** The clinic recorded this day: its record is final, the patient cannot change it. */
  clinic: boolean
}

const STATUS: Record<string, { label: string; className: string }> = {
  active: { label: "In progress", className: "bg-primary/15 text-primary" },
  completed: { label: "Completed", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  cancelled: { label: "Stopped", className: "bg-muted text-muted-foreground" },
}

/** Today in the clinic's calendar — the same day the server reckons by. */
function today(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function pretty(date: string, withDay = true): string {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return date
  // Built and read in UTC: a date-only value through the local zone shows as
  // the day before for anyone west of the clinic.
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    ...(withDay ? { weekday: "short" as const } : {}),
    day: "numeric",
    month: "short",
  })
}

/**
 * Every day of the course from its start, to its last sitting (or, while it
 * runs, to whichever is later of today and the days the plan prescribes).
 *
 * Sittings are counted, not days: a course of 22 sittings given on 22 days
 * spread over five weeks is 22 done. A day with a sitting — at the clinic or
 * logged at home — is green. A day without one is red ("missed") only while the
 * course still has sittings to give; once they are all given, or the course is
 * over, it was simply a day off, and shows grey.
 */
function daysOf(course: Course, now: string): Day[] {
  const start = course.enrollment.startDate ?? course.enrollment.activatedAt?.slice(0, 10) ?? null
  if (!start) return []
  const total = Math.max(course.enrollment.sittings || 0, 1)
  const counted = course.sittings.filter((s) => s.status !== "pending")
  const lastLogged = counted.reduce((m, s) => (s.plannedDate > m ? s.plannedDate : m), start)
  const doneCount = new Set(counted.filter((s) => s.status === "done").map((s) => s.plannedDate)).size
  const finished = course.enrollment.status !== "active" || doneCount >= total
  const planned = addDays(start, Math.max(course.enrollment.durationDays || 0, total) - 1)
  const end = finished ? lastLogged : [planned, lastLogged, now].reduce((m, d) => (d > m ? d : m))

  const out: Day[] = []
  let sitting = 0
  for (let date = start; date <= end && out.length < 400; date = addDays(date, 1)) {
    const that = counted.filter((s) => s.plannedDate === date)
    // The clinic's record is final: when it has the day, it decides the colour
    // and the patient's own entry for that day is locked.
    const staff = that.filter((s) => s.loggedSource !== "patient")
    const decides = staff.length ? staff : that
    const done = decides.find((s) => s.status === "done")
    const missed = decides.find((s) => s.status === "missed")
    const mine = staff.length ? null : (that.find((s) => s.loggedSource === "patient") ?? null)
    if (done) sitting++
    out.push({
      date,
      n: done ? sitting : null,
      state: done ? "done" : missed ? "missed" : date === now && !finished ? "today" : date > now ? "upcoming" : finished ? "rest" : "missed",
      where: done ? (done.loggedSource === "patient" || done.mode === "at_home" ? "home" : "clinic") : null,
      mine,
      clinic: staff.length > 0,
    })
  }
  return out
}

/**
 * Your therapy, day by day: log the days you do it at home, see every day of
 * the course in colour, and how many of the prescribed days are done.
 *
 * Days at the clinic are recorded by the therapist when you come in; this page
 * shows them but will not let you claim one. Home days are yours to log — on
 * the day, or a day you forgot to.
 */
export function TherapyLog() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pickDate, setPickDate] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const res = await fetch("/api/patient/therapy")
    const data = await res.json().catch(() => null)
    setCourses(data?.courses ?? [])
  }, [])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  async function log(enrollmentId: string, date: string, status: "done" | "missed") {
    setBusy(`${enrollmentId}:${date}`)
    setError(null)
    try {
      const res = await fetch("/api/patient/therapy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrollmentId, date, status }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not save that")
        return
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function undo(sitting: Sitting) {
    setBusy(sitting.id)
    setError(null)
    try {
      const res = await fetch("/api/patient/therapy", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sittingId: sitting.id, status: "pending" }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) setError(data?.error ?? "Could not undo that")
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex w-full justify-center py-16">
        <PredictSpinner />
      </div>
    )
  }

  if (courses.length === 0) {
    return (
      <div className="w-full rounded-2xl border border-dashed p-8 text-center">
        <Activity className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium">No therapy course yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your course appears here once your doctor prescribes it and you have started it at the clinic.
        </p>
      </div>
    )
  }

  const now = today()

  return (
    <div className="flex w-full flex-col gap-4 md:gap-6">
      {error && (
        <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {courses.map((course) => {
        const { enrollment, items, billing } = course
        const status = STATUS[enrollment.status] ?? { label: enrollment.status, className: "bg-muted text-muted-foreground" }
        const days = daysOf(course, now)
        // Sittings, not days: done of the sittings the course has.
        const total = Math.max(enrollment.sittings || 0, 1)
        const done = days.filter((d) => d.state === "done").length
        const missed = days.filter((d) => d.state === "missed").length
        const todayRow = days.find((d) => d.date === now) ?? null
        const canLog = enrollment.status !== "cancelled" && days.length > 0
        const lastDay = days[days.length - 1]?.date ?? now
        const chosen = pickDate[enrollment.id] ?? ""
        const start = days[0]?.date ?? null

        return (
          <section key={enrollment.id} className="rounded-2xl border bg-card p-4 md:p-5">
            {/* WHICH COURSE */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-semibold md:text-lg">{enrollment.planName}</h2>
                <p className="text-xs text-muted-foreground md:text-sm">
                  {describePlan(enrollment)}
                  {start ? ` · started ${pretty(start)}` : ""}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
            </div>

            {/* HOW FAR — done of prescribed, and the missed days said plainly. */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl border p-2.5">
                <p className="text-[11px] text-muted-foreground">Done</p>
                <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {done}
                  <span className="text-xs font-normal text-muted-foreground"> / {total}</span>
                </p>
              </div>
              <div className="rounded-xl border p-2.5">
                <p className="text-[11px] text-muted-foreground">Missed</p>
                <p className={`text-lg font-semibold tabular-nums ${missed ? "text-destructive" : "text-muted-foreground"}`}>{missed}</p>
              </div>
              <div className="rounded-xl border p-2.5">
                <p className="text-[11px] text-muted-foreground">Sittings left</p>
                <p className="text-lg font-semibold tabular-nums">{Math.max(0, total - done)}</p>
              </div>
            </div>
            <div
              className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label="Therapy days done"
            >
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (done / total) * 100)}%` }} />
            </div>

            {/* LOG — today first; any earlier day of the course from the date box. */}
            {canLog && (
              <div className="mt-4 flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center">
                {todayRow && todayRow.state !== "done" && !todayRow.clinic ? (
                  <>
                    <p className="text-sm font-medium sm:flex-1">Did your therapy today?</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => log(enrollment.id, now, "done")} disabled={busy !== null}>
                        {busy === `${enrollment.id}:${now}` ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        Yes, I did it
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => log(enrollment.id, now, "missed")} disabled={busy !== null}>
                        Missed today
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm font-medium sm:flex-1">
                    {todayRow?.clinic ? "The clinic has recorded today." : todayRow ? "Today's therapy is logged." : now > lastDay ? "Your course days are over." : "Your course has not reached today."}
                  </p>
                )}
                {/* A day forgotten earlier in the course. */}
                <div className="flex items-center gap-2 border-t pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3">
                  <Input
                    type="date"
                    value={chosen}
                    min={start ?? undefined}
                    max={now < lastDay ? now : lastDay}
                    onChange={(e) => setPickDate((p) => ({ ...p, [enrollment.id]: e.target.value }))}
                    className="h-8 w-[9.5rem] text-xs"
                    aria-label="Log an earlier day"
                  />
                  <Button size="sm" variant="outline" disabled={!chosen || busy !== null} onClick={() => log(enrollment.id, chosen, "done")}>
                    Log as done
                  </Button>
                </div>
              </div>
            )}

            {/* EVERY DAY — green done, red missed, today outlined, the rest to come. */}
            {days.length > 0 && (
              <>
                <div className="mt-4 grid grid-cols-5 gap-1.5 sm:grid-cols-7 md:grid-cols-10">
                  {days.map((d) => {
                    const look =
                      d.state === "done"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : d.state === "missed"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : d.state === "rest"
                            ? "border-transparent bg-muted/50 text-muted-foreground/70"
                            : d.state === "today"
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-dashed text-muted-foreground"
                    const isBusy = busy === `${enrollment.id}:${d.date}` || busy === d.mine?.id
                    return (
                      <div
                        key={d.date}
                        title={`${d.n ? `Sitting ${d.n} · ` : d.state === "rest" ? "No sitting · " : ""}${pretty(d.date)}${d.where ? ` · ${d.where === "clinic" ? "at the clinic" : "at home"}` : ""}${d.clinic ? " · recorded by the clinic" : ""}`}
                        className={`group relative flex flex-col items-center rounded-lg border px-1 py-1.5 text-center ${look}`}
                      >
                        <span className="text-[10px] leading-none opacity-70">{d.n ? `#${d.n}` : pretty(d.date).split(",")[0]}</span>
                        <span className="mt-1 text-xs font-semibold leading-none">{pretty(d.date, false)}</span>
                        <span className="mt-1 flex h-3.5 items-center">
                          {isBusy ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : d.state === "done" ? (
                            d.where === "clinic" ? <Hospital className="size-3" /> : <Home className="size-3" />
                          ) : d.state === "missed" ? (
                            <X className="size-3" />
                          ) : null}
                        </span>
                        {/* Their own entry can be taken back; a red past day can be logged. */}
                        {d.mine && !isBusy && (
                          <button
                            type="button"
                            onClick={() => undo(d.mine!)}
                            className="absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm group-hover:flex"
                            aria-label={`Undo ${pretty(d.date)}`}
                          >
                            <Undo2 className="size-3" />
                          </button>
                        )}
                        {d.state === "missed" && !d.mine && !d.clinic && !isBusy && canLog && (
                          <button
                            type="button"
                            onClick={() => log(enrollment.id, d.date, "done")}
                            className="absolute inset-0 hidden items-center justify-center rounded-lg bg-emerald-600/90 text-[10px] font-semibold text-white group-hover:flex"
                          >
                            I did it
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2.5 rounded-sm bg-emerald-500/60" /> Done
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2.5 rounded-sm bg-destructive/60" /> Missed
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Hospital className="size-3" /> At the clinic
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Home className="size-3" /> At home
                  </span>
                </div>
              </>
            )}

            {/* What they were charged and what they were given. */}
            {items.length > 0 && (
              <details className="mt-4 rounded-xl border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">What this includes — {formatPrice(billing.totalInPaise)}</summary>
                <table className="w-full border-t text-sm">
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-3 py-1.5">
                          {item.name}
                          {item.isExtra && (
                            <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-amber-600 uppercase dark:text-amber-400">
                              extra
                            </span>
                          )}
                        </td>
                        <td className="w-14 px-2 py-1.5 text-right text-muted-foreground tabular-nums">× {item.quantity}</td>
                        <td className="w-24 px-3 py-1.5 text-right tabular-nums">{formatPrice(item.rateInPaise * item.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
              Days at the clinic are recorded by your therapist when you come in, and the clinic's record is final. Days you do at home are yours to log — the same day if you can.
            </p>
          </section>
        )
      })}
    </div>
  )
}

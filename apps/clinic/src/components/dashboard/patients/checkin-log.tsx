"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import {
  CHECKINS,
  CHECKIN_KINDS,
  checkinOption,
  istDate,
  type CheckinEntry,
  type CheckinKind,
  type CheckinScore,
} from "@workspace/db/checkin"
import { PredictSpinner } from "@/src/components/predict-loader"

const TONE: Record<CheckinScore, string> = {
  done: "bg-emerald-500 text-white",
  partial: "bg-amber-400 text-amber-950",
  missed: "bg-red-500 text-white",
}

const RANGES = [14, 30] as const

type View = { type: "recent"; days: (typeof RANGES)[number] } | { type: "month"; month: string }

/** "2026-10" plus n months. */
function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
}

/** The days a view shows, oldest first, never past yesterday — today is asked about tomorrow. */
function daysOf(view: View): string[] {
  const yesterday = istDate(new Date(), -1)
  if (view.type === "recent") return Array.from({ length: view.days }, (_, i) => istDate(new Date(), -(view.days - i)))
  const [y, m] = view.month.split("-").map(Number) as [number, number]
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: last }, (_, i) => `${view.month}-${String(i + 1).padStart(2, "0")}`).filter((d) => d <= yesterday)
}

/**
 * The patient's daily check-ins — medicine, exercise and diet — one row per
 * kind, one square per day: green done, amber partly, red missed, grey no
 * answer. The answers come from the WhatsApp check-in each morning; a tap on a
 * day lets staff record or correct it by hand.
 */
export function CheckinLog({ contactId, kinds = CHECKIN_KINDS }: { contactId: string; kinds?: CheckinKind[] }) {
  const [entries, setEntries] = useState<CheckinEntry[] | null>(null)
  const [view, setView] = useState<View>({ type: "recent", days: 14 })
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/staff/patients/${contactId}/checkins${view.type === "month" ? `?month=${view.month}` : ""}`,
    )
    const data = await res.json().catch(() => null)
    setEntries(res.ok ? (data?.checkins ?? []) : [])
  }, [contactId, view])

  useEffect(() => {
    load()
  }, [load])

  async function mark(kind: CheckinKind, date: string, response: string) {
    setOpen(null)
    const res = await fetch(`/api/staff/patients/${contactId}/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, date, response }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return toast.error(data?.error ?? "Could not record it")
    await load()
    toast.success("Recorded")
  }

  if (entries === null) {
    return (
      <div className="flex justify-center py-6">
        <PredictSpinner className="size-5" />
      </div>
    )
  }

  const days = daysOf(view)
  const thisMonth = istDate(new Date(), -1).slice(0, 7)
  const shownMonth = view.type === "month" ? view.month : thisMonth
  const byKey = new Map(entries.map((e) => [`${e.kind}:${e.forDate}`, e]))
  const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <Legend tone={TONE.done} label="Done" />
          <Legend tone={TONE.partial} label="Partly" />
          <Legend tone={TONE.missed} label="Missed" />
          <Legend tone="bg-muted" label="No answer" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex overflow-hidden rounded-md border border-border">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setView({ type: "recent", days: r })}
                className={`px-2.5 py-1 font-medium ${
                  view.type === "recent" && view.days === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Last {r} days
              </button>
            ))}
          </div>
          {/* A month at a time, back as far as the patient goes. */}
          <div
            className={`flex items-center overflow-hidden rounded-md border ${
              view.type === "month" ? "border-primary" : "border-border"
            }`}
          >
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setView({ type: "month", month: shiftMonth(shownMonth, view.type === "month" ? -1 : 0) })}
              className="px-1.5 py-1 text-muted-foreground hover:bg-muted"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView({ type: "month", month: shownMonth })}
              className={`min-w-28 px-2 py-1 text-center font-medium ${
                view.type === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {monthLabel(shownMonth)}
            </button>
            <button
              type="button"
              aria-label="Next month"
              disabled={shownMonth >= thisMonth}
              onClick={() => setView({ type: "month", month: shiftMonth(shownMonth, 1) })}
              className="px-1.5 py-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {kinds.map((kind) => {
        const def = CHECKINS[kind]
        const answered = days.map((d) => byKey.get(`${kind}:${d}`)).filter(Boolean) as CheckinEntry[]
        const done = answered.filter((e) => checkinOption(kind, e.response)?.score === "done").length
        return (
          <div key={kind} className="rounded-md border border-border p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">{def.label}</p>
              <p className="text-xs text-muted-foreground">
                {answered.length ? `Fully on ${done} of ${answered.length} answered days` : "No answers yet"}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {days.map((d) => {
                const entry = byKey.get(`${kind}:${d}`)
                const option = entry ? checkinOption(kind, entry.response) : null
                const id = `${kind}:${d}`
                const [dd, mm] = dayLabel(d).split(" ")
                return (
                  <div key={d} className="relative">
                    <button
                      type="button"
                      title={`${dayLabel(d)}: ${option ? option.label : "no answer"}${entry?.source === "staff" ? " (entered by staff)" : ""}`}
                      onClick={() => setOpen(open === id ? null : id)}
                      className={`flex h-9 w-9 flex-col items-center justify-center rounded-md text-[10px] font-medium leading-tight ${
                        option ? TONE[option.score] : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <span>{dd}</span>
                      <span className="opacity-80">{mm}</span>
                    </button>
                    {open === id && (
                      <div className="absolute left-0 top-10 z-20 flex gap-1 rounded-md border border-border bg-popover p-1 shadow-md">
                        {def.options.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => mark(kind, d, o.value)}
                            className={`whitespace-nowrap rounded px-2 py-1 text-xs font-medium ${TONE[o.score]}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <p className="text-[11px] text-muted-foreground">
        Asked on WhatsApp every morning about the day before, while the patient&apos;s plan runs. Tap a day to record or
        correct an answer by hand.
      </p>
    </section>
  )
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`size-2.5 rounded-sm ${tone}`} /> {label}
    </span>
  )
}

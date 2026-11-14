"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CheckCircle2, ChevronLeft, ChevronRight, MessageCircle, Phone, RefreshCw } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"

interface QueueRow {
  id: string
  name: string | null
  phone: string | null
  city: string | null
  interest: string | null
  source: string | null
  campaign: string | null
  createdAt: string
  leadStatus: string | null
  leadStatusAt: string | null
  callbackAt: string | null
  assignedUserId: string | null
  assignedName: string | null
  assignedToMe: boolean
}

interface Queue {
  generatedAt: string
  clinic: { id: string; name: string }
  firstResponseMinutes: number
  retryAfterHours: number
  seesEveryone: boolean
  sections: {
    callbacksDue: QueueRow[]
    waiting: QueueRow[]
    fresh: QueueRow[]
    retry: QueueRow[]
    callbacksLater: QueueRow[]
  }
  /** Rows per page, each section's full size, and the page each is on. */
  pageSize: number
  totals: Record<"callbacksDue" | "waiting" | "fresh" | "retry" | "callbacksLater", number>
  pages: Record<"callbacksDue" | "waiting" | "fresh" | "retry" | "callbacksLater", number>
}

type SectionKey = keyof Queue["sections"]

/** "42 min", "3 h", "2 d" — the one number a caller needs, not a timestamp. */
function span(ms: number) {
  const minutes = Math.max(0, Math.round(Math.abs(ms) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.round(hours / 24)} d`
}

function clock(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })
}

/** datetime-local wants local "YYYY-MM-DDTHH:mm". */
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function inOneHour() {
  const d = new Date(Date.now() + 60 * 60_000)
  d.setSeconds(0, 0)
  return d
}

function tomorrowAt(hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d
}

const SECTIONS: {
  key: SectionKey
  title: string
  tone: string
  empty: string
  when: (row: QueueRow, q: Queue) => string
}[] = [
  {
    key: "callbacksDue",
    title: "Callbacks due",
    tone: "bg-red-500",
    empty: "No callbacks due.",
    when: (r) =>
      r.callbackAt
        ? `${r.leadStatus === "NO_ANSWER" || r.leadStatus === "NOT_REACHABLE" ? "not connected — try again" : "promised"} ${clock(r.callbackAt)} · ${span(Date.now() - +new Date(r.callbackAt))} ago`
        : "",
  },
  {
    key: "waiting",
    title: "Waiting too long",
    tone: "bg-amber-500",
    empty: "Every lead has been called inside the window.",
    when: (r) => `arrived ${span(Date.now() - +new Date(r.createdAt))} ago, not called yet`,
  },
  {
    key: "fresh",
    title: "Just arrived",
    tone: "bg-emerald-500",
    empty: "No new leads right now.",
    when: (r, q) => {
      const left = q.firstResponseMinutes * 60_000 - (Date.now() - +new Date(r.createdAt))
      return `arrived ${span(Date.now() - +new Date(r.createdAt))} ago · call within ${span(left)}`
    },
  },
  {
    key: "retry",
    title: "Try again — no answer / missed",
    tone: "bg-sky-500",
    empty: "Nothing to retry.",
    when: (r) => {
      const what =
        r.leadStatus === "APPOINTMENT_MISSED"
          ? "missed the appointment"
          : r.leadStatus === "APPOINTMENT_CANCELLED"
            ? "cancelled the appointment"
            : r.leadStatus === "NOT_REACHABLE"
              ? "switched off / busy"
              : "no answer"
      return r.leadStatusAt ? `${what} ${span(Date.now() - +new Date(r.leadStatusAt))} ago` : what
    },
  },
  {
    key: "callbacksLater",
    title: "Callbacks later today",
    tone: "bg-muted-foreground/50",
    empty: "No callbacks promised for later.",
    when: (r) =>
      r.callbackAt
        ? `${r.leadStatus === "NO_ANSWER" || r.leadStatus === "NOT_REACHABLE" ? "try again" : ""} at ${clock(r.callbackAt)} · in ${span(+new Date(r.callbackAt) - Date.now())}`.trim()
        : "",
  },
]

const OUTCOMES: { status: string; label: string }[] = [
  { status: "CONTACTED", label: "Spoke" },
  { status: "NO_ANSWER", label: "No answer" },
  { status: "INTERESTED", label: "Interested" },
  { status: "NOT_INTERESTED", label: "Not interested" },
  { status: "INVALID_NUMBER", label: "Wrong number" },
]

/**
 * The call queue — who to phone, in the order to phone them.
 *
 * Replaces the email alerts: a lead that has waited too long, a callback
 * that has come due, a new lead just routed to you — all of it is here, on
 * the screen a telecaller works from, instead of in an inbox beside it.
 * Setting an outcome takes the lead straight off the queue.
 */
/** A section count you tap to show only that section; the chosen one is outlined in the brand colour. */
function tileClass(on: boolean) {
  return `flex w-full cursor-pointer flex-col items-start gap-1.5 rounded-xl border px-4 py-3.5 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    on ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-card hover:border-foreground/25 hover:bg-muted/60"
  }`
}

export default function CallQueuePage() {
  const [queue, setQueue] = useState<Queue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [schedulingId, setSchedulingId] = useState<string | null>(null)
  const [callbackWhen, setCallbackWhen] = useState("")
  const [, setTick] = useState(0)
  const [filter, setFilter] = useState<SectionKey | "all">("all")
  // Each section pages on its own, so finishing page 1 of "Waiting" does not
  // move "Try again".
  const [pageSize, setPageSize] = useState(25)
  const [pages, setPages] = useState<Partial<Record<SectionKey, number>>>({})

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: String(pageSize) })
    for (const [key, page] of Object.entries(pages)) if (page && page > 1) params.set(`page.${key}`, String(page))
    const res = await fetch(`/api/call-queue?${params}`)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error ?? "Could not load the queue")
      return
    }
    setError(null)
    setQueue(data)
  }, [pageSize, pages])

  useEffect(() => {
    load().finally(() => setLoading(false))
    // New leads arrive by webhook, so the queue has to come to the caller.
    const refresh = setInterval(load, 30_000)
    // And the "waiting 12 min" labels keep counting between refreshes.
    const tick = setInterval(() => setTick((t) => t + 1), 20_000)
    return () => {
      clearInterval(refresh)
      clearInterval(tick)
    }
  }, [load])

  async function setOutcome(row: QueueRow, status: string, callbackAt?: Date) {
    setBusyId(row.id)
    setError(null)
    const res = await fetch(`/api/contacts/${row.id}/lead-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(callbackAt ? { callbackAt: callbackAt.toISOString() } : {}) }),
    })
    const data = await res.json().catch(() => ({}))
    setBusyId(null)
    if (!res.ok) {
      setError(data.error ?? "Could not save that")
      toast.error(data.error ?? "Could not save that")
      return
    }
    toast.success(callbackAt ? "Callback scheduled" : "Call outcome saved")
    setSchedulingId(null)
    await load()
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  if (!queue) {
    return <p className="rounded-md border border-border p-6 text-center text-sm">{error ?? "No queue."}</p>
  }

  // The whole section, not the page on screen.
  const sizeOf = (key: SectionKey) => queue.totals?.[key] ?? queue.sections[key].length
  const total = sizeOf("callbacksDue") + sizeOf("waiting") + sizeOf("fresh") + sizeOf("retry")
  const goTo = (key: SectionKey, page: number) => setPages((p) => ({ ...p, [key]: page }))

  const visible = SECTIONS.filter((section) => {
    if (filter !== "all") return section.key === filter
    // A quiet section with nothing in it is noise; the two that are always
    // worth confirming empty stay.
    return sizeOf(section.key) > 0 || section.key === "callbacksDue" || section.key === "waiting"
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Call queue"
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Show
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPages({})
                }}
                aria-label="Leads per section"
                className="h-8 rounded-md border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none"
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" variant="outline" onClick={() => load()}>
              <RefreshCw /> Refresh
            </Button>
          </div>
        }
      />

      {/* One tile per section: the count at a glance, and a tap shows only
          that section. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <button type="button" onClick={() => setFilter("all")} aria-pressed={filter === "all"} className={tileClass(filter === "all")}>
          <span className="text-2xl font-semibold tabular-nums leading-none">{total}</span>
          <span className="text-xs text-muted-foreground">To call now</span>
        </button>
        {SECTIONS.map((section) => {
          const count = sizeOf(section.key)
          const on = filter === section.key
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setFilter(on ? "all" : section.key)}
              aria-pressed={on}
              className={tileClass(on)}
            >
              <span className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${section.tone}`} />
                <span className="text-2xl font-semibold tabular-nums leading-none">{count}</span>
              </span>
              <span className="w-full truncate text-xs text-muted-foreground">{section.title}</span>
            </button>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Leads not called within {queue.firstResponseMinutes} minutes move up to <b>Waiting too long</b>. Setting an
        outcome takes the lead off the queue.
      </p>

      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {filter === "all" && total === 0 && sizeOf("callbacksLater") === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-14 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-medium">All caught up</p>
          <p className="text-xs text-muted-foreground">Nobody is waiting for a call. New leads appear here on their own.</p>
        </div>
      ) : (
        visible.map((section) => {
          const rows = queue.sections[section.key]
          const sectionTotal = sizeOf(section.key)
          const size = queue.pageSize ?? pageSize
          const page = queue.pages?.[section.key] ?? 1
          const lastPage = Math.max(1, Math.ceil(sectionTotal / size))
          return (
            <section key={section.key} className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span className={`size-2 rounded-full ${section.tone}`} />
                {section.title}
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
                  {sectionTotal}
                </span>
              </h2>

              {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  {section.empty}
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {rows.map((row) => (
                    <QueueItem
                      key={row.id}
                      row={row}
                      when={section.when(row, queue)}
                      tone={section.tone}
                      showOwner={queue.seesEveryone}
                      busy={busyId === row.id}
                      scheduling={schedulingId === row.id}
                      callbackWhen={callbackWhen}
                      onCallbackWhen={setCallbackWhen}
                      onToggleSchedule={() => {
                        setSchedulingId(schedulingId === row.id ? null : row.id)
                        setCallbackWhen(toLocalInput(inOneHour()))
                      }}
                      onOutcome={(status, at) => setOutcome(row, status, at)}
                    />
                  ))}
                </ul>
              )}

              {sectionTotal > size && (
                <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {((page - 1) * size + 1).toLocaleString("en-IN")}–{Math.min(page * size, sectionTotal).toLocaleString("en-IN")} of{" "}
                    {sectionTotal.toLocaleString("en-IN")}
                  </span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label={`Previous page of ${section.title}`}
                    disabled={page <= 1}
                    onClick={() => goTo(section.key, page - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <span className="tabular-nums">
                    {page} / {lastPage}
                  </span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label={`Next page of ${section.title}`}
                    disabled={page >= lastPage}
                    onClick={() => goTo(section.key, page + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}

/** 918530355551 → +91 85303 55551. */
function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "")
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`
  return `+${d}`
}

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return name.replace(/\D/g, "").slice(-2) || "#"
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase()
}

/**
 * One lead to phone. Wide screens: who and when on the left, the call buttons
 * and the outcome pills on the right of the same row. Phones: stacked, with the
 * call buttons full width where a thumb finds them.
 */
function QueueItem({
  row,
  when,
  tone,
  showOwner,
  busy,
  scheduling,
  callbackWhen,
  onCallbackWhen,
  onToggleSchedule,
  onOutcome,
}: {
  row: QueueRow
  when: string
  tone: string
  showOwner: boolean
  busy: boolean
  scheduling: boolean
  callbackWhen: string
  onCallbackWhen: (v: string) => void
  onToggleSchedule: () => void
  onOutcome: (status: string, callbackAt?: Date) => void
}) {
  const name = row.name?.trim() || (row.phone ? formatPhone(row.phone) : "Unnamed lead")
  const meta = [
    row.interest?.replace(/_/g, " "),
    row.city,
    row.source?.toLowerCase().replace(/_/g, " "),
    showOwner ? (row.assignedToMe ? "yours" : row.assignedName ?? "unassigned") : null,
  ].filter(Boolean)

  return (
    <li className="bg-background p-3 sm:px-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(name)}
            <span className={`absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-background ${tone}`} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Link href={`/contacts/${row.id}`} className="truncate font-medium hover:underline">
                {name}
              </Link>
              {row.name?.trim() && row.phone && (
                <span className="text-xs tabular-nums text-muted-foreground">{formatPhone(row.phone)}</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-foreground/80">{when}</p>
            {meta.length > 0 && (
              <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">{meta.join(" · ")}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          {row.phone && (
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button size="sm" nativeButton={false} render={<a href={`tel:+${row.phone}`} />}>
                <Phone /> Call
              </Button>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<a href={`https://wa.me/${row.phone}`} target="_blank" rel="noreferrer" />}
              >
                <MessageCircle /> WhatsApp
              </Button>
            </div>
          )}

          {/* The outcome of the call, one tap. Any of these takes the lead off
              this section — that is how the queue empties. */}
          <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
            {OUTCOMES.map((o) => (
              <Button key={o.status} disabled={busy} onClick={() => onOutcome(o.status)} size="sm" variant="outline">
                {o.label}
              </Button>
            ))}
            <Button
              disabled={busy}
              onClick={onToggleSchedule}
              size="sm"
              variant={scheduling ? "outline" : "ghost"}
            >
              Call back…
            </Button>
            {busy && <PredictSpinner className="size-4" />}
          </div>
        </div>
      </div>

      {scheduling && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
          <span className="text-xs text-muted-foreground">Call back</span>
          <Button onClick={() => onOutcome("CALLBACK_LATER", inOneHour())} size="sm" variant="outline">
            In 1 hour
          </Button>
          <Button onClick={() => onOutcome("CALLBACK_LATER", tomorrowAt(11))} size="sm" variant="outline">
            Tomorrow 11 am
          </Button>
          <input
            type="datetime-local"
            value={callbackWhen}
            onChange={(e) => onCallbackWhen(e.target.value)}
            className="min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
          <Button
            size="sm"
            disabled={!callbackWhen}
            onClick={() => onOutcome("CALLBACK_LATER", new Date(callbackWhen))}
          >
            Set
          </Button>
        </div>
      )}
    </li>
  )
}

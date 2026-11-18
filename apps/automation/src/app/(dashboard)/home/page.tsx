"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  RefreshCw,
  ChevronRight,
  MessageSquareReply,
  ListChecks,
  AlertTriangle,
  XCircle,
  Info,
  Workflow,
  CalendarClock,
  Sprout,
  BellRing,
} from "lucide-react"
import {
  OPERATIONAL_PHASES,
  OPERATIONAL_STAGES,
  SIDE_FILTERS,
} from "@workspace/db/operational-stage"
import { SIDE_META } from "@workspace/db/contact-side"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"

interface AwaitingReply {
  contactId: string
  conversationId: string
  name: string | null
  phone: string | null
  body: string | null
  receivedAt: string
  hoursLeft: number
  windowOpen: boolean
}
interface OverdueTask {
  id: string
  title: string
  dueAt: string | null
  assignedRole: string | null
  contactId: string
  contactName: string | null
}
interface FailedSend {
  id: string
  createdAt: string
  contactId: string
  contactName: string | null
  contactPhone: string | null
  templateName: string | null
  status: string
}
interface FailedRun {
  id: string
  startedAt: string
  flowName: string
  contactId: string | null
  contactName: string | null
}

interface HomeData {
  /** Eight derived operational stages, keyed by stage name. */
  funnel: Record<string, number>
  /** Exits and flags, outside the funnel. */
  side: Record<string, number>
  /** The five values actually stored on contact.stage. */
  lifecycle: Record<string, number>
  inNurture: number
  upcomingAppointments: number
  flows: { active: number; draft: number }
  openTasks: number
  attention: {
    awaitingReply: AwaitingReply[]
    overdueTasks: OverdueTask[]
    failedSends: FailedSend[]
    failedRuns: FailedRun[]
  }
}

// A funnel number opens the list its people are actually on. Every bucket but
// the last describes somebody not yet seen, so only Patient crosses over.
function funnelList(stage: string): string {
  return SIDE_META[stage === "PATIENT" ? "patients" : "leads"].route
}

// Same for the exits below the funnel — inactive is a patient who went quiet,
// everything else is a lead-desk question.
function flagList(key: string): string {
  return SIDE_META[key === "INACTIVE" ? "patients" : "leads"].route
}

const PHASE_TONE: Record<string, { text: string; dot: string }> = {
  ACQUISITION: { text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  ENGAGEMENT: { text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  APPOINTMENT: { text: "text-indigo-600 dark:text-indigo-400", dot: "bg-indigo-500" },
  PATIENT: { text: "text-green-600 dark:text-green-400", dot: "bg-green-500" },
}

// The one stage that is a person's job rather than the automation's — worth
// a colour when anybody is sitting in it.
const NEEDS_A_PERSON = "HUMAN_FOLLOW_UP"

function Stat({
  icon: Icon,
  label,
  value,
  href,
  warn,
}: {
  icon: typeof ListChecks
  label: string
  value: number
  href?: string
  warn?: boolean
}) {
  const body = (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-ring">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
          warn ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg leading-none font-semibold tabular-nums">{value}</span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{label}</span>
      </span>
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

/**
 * Where everybody is, as one left-to-right flow: four phases, each with its
 * stages as small steps. The explanation of each step is its tooltip, so the
 * strip stays one row high.
 */
function StageFlow({ funnel, side }: { funnel: Record<string, number>; side: Record<string, number> }) {
  const [explain, setExplain] = useState(false)

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Lead journey</h2>
        <button
          type="button"
          onClick={() => setExplain((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={explain}
        >
          <Info className="h-3.5 w-3.5" />
          How it works
        </button>
      </div>

      {explain && (
        <p className="border-b border-border bg-muted/50 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          A captured lead gets WhatsApp nudges on day 1, 3 and 5. Tapping{" "}
          <span className="font-medium text-foreground">Schedule an appointment</span> hands off to the
          booking flow, which offers open dates, then open time slots. Booking moves them to{" "}
          <span className="font-medium text-foreground">Booked</span>; only a visit marked completed makes
          them a <span className="font-medium text-foreground">Patient</span>, and a no-show puts them
          straight back into nurture. Anything the automation can&apos;t handle raises a task for a human.
        </p>
      )}

      {/* One row across the full width on a wide screen, each phase as wide
          as its stages; on a smaller one the phases stack, two and then one
          to a row, so nothing ever scrolls sideways. */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:flex xl:items-stretch xl:gap-1">
          {OPERATIONAL_PHASES.map((phase, phaseIndex) => {
            const stages = OPERATIONAL_STAGES.filter((s) => s.phase === phase.phase)
            const tone = PHASE_TONE[phase.phase]
            return (
              <div
                key={phase.phase}
                className="flex min-w-0 items-stretch gap-1"
                style={{ flexGrow: stages.length, flexBasis: 0 }}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p
                    className={`flex items-center gap-1.5 px-1 text-[10px] font-semibold tracking-widest uppercase ${
                      tone?.text ?? "text-muted-foreground"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${tone?.dot ?? "bg-muted-foreground"}`} />
                    {phase.label}
                  </p>
                  <div className="flex flex-1 items-stretch gap-1">
                    {stages.map((s, i) => {
                      const n = funnel[s.stage] ?? 0
                      const hot = s.stage === NEEDS_A_PERSON && n > 0
                      return (
                        <div key={s.stage} className="flex min-w-0 flex-1 items-center gap-1">
                          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
                          <Link
                            href={`${funnelList(s.stage)}?operationalStage=${s.stage}`}
                            title={s.caption}
                            className={`flex h-full min-w-0 flex-1 flex-col justify-center rounded-md border px-2.5 py-1.5 transition-colors hover:border-ring ${
                              hot ? "border-amber-500/50 bg-amber-500/10" : "border-border bg-muted/40"
                            }`}
                          >
                            <span
                              className={`text-lg leading-tight font-semibold tabular-nums ${
                                hot ? "text-amber-600 dark:text-amber-400" : n === 0 ? "text-muted-foreground" : ""
                              }`}
                            >
                              {n}
                            </span>
                            <span className="truncate text-[11px] leading-tight text-muted-foreground">
                              {s.label}
                            </span>
                          </Link>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {phaseIndex < OPERATIONAL_PHASES.length - 1 && (
                  <div className="hidden items-end pb-4 xl:flex">
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2.5">
        <span className="mr-1 text-xs text-muted-foreground">Dropped out:</span>
        {SIDE_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`${flagList(f.key)}?side=${f.key}`}
            title={f.derivedFrom}
            className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-ring hover:text-foreground"
          >
            {f.label} <span className="font-semibold tabular-nums">{side[f.key] ?? 0}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function Panel({
  icon: Icon,
  title,
  count,
  tone,
  children,
}: {
  icon: typeof ListChecks
  title: string
  count: number
  tone: "amber" | "red" | "neutral"
  children: React.ReactNode
}) {
  const toneClass =
    tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-700" : "text-muted-foreground"
  return (
    <section className="flex flex-col rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className={`h-4 w-4 ${toneClass}`} />
          {title}
        </h2>
        {count > 0 && (
          <span className={`rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums ${toneClass}`}>
            {count}
          </span>
        )}
      </div>
      {/* A long list scrolls inside its card instead of stretching the page. */}
      <div className="max-h-80 overflow-y-auto p-3">{children}</div>
    </section>
  )
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/home")
      setData(await res.json().catch(() => null))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading || !data) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  const { funnel, side, attention } = data
  const attentionCount =
    attention.awaitingReply.length +
    attention.overdueTasks.length +
    attention.failedSends.length +
    attention.failedRuns.length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Home"
        description={
          <>
            {data.flows.active} automation{data.flows.active === 1 ? "" : "s"} running
            {data.flows.draft > 0 && ` · ${data.flows.draft} draft`}
          </>
        }
        actions={
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={BellRing} label="Needs attention" value={attentionCount} warn={attentionCount > 0} />
        <Stat icon={ListChecks} label="Open tasks" value={data.openTasks} href="/tasks" />
        <Stat icon={CalendarClock} label="Upcoming appointments" value={data.upcomingAppointments} />
        <Stat icon={Sprout} label="In nurture" value={data.inNurture} />
      </div>

      {/* Every count is computed from runs, messages, tasks and appointments —
          none of it is a stored status, so the flow cannot drift out of step
          with the rows underneath it. */}
      <StageFlow funnel={funnel} side={side} />

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Workflow className="h-4 w-4 text-muted-foreground" />
          Needs attention
        </h2>

        {attentionCount === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Nothing waiting on a human right now.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {attention.awaitingReply.length > 0 && (
              <Panel
                icon={MessageSquareReply}
                title="Waiting on us"
                count={attention.awaitingReply.length}
                tone="amber"
              >
                <ul className="space-y-1.5 text-sm">
                  {attention.awaitingReply.map((r) => (
                    <li key={r.conversationId}>
                      <Link
                        href={`/contacts/${r.contactId}`}
                        className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-1.5 hover:border-ring"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{r.name ?? r.phone ?? "Unknown"}</span>
                          {r.body && (
                            <span className="block truncate text-xs text-muted-foreground">{r.body}</span>
                          )}
                        </span>
                        <span
                          className={`shrink-0 text-[11px] ${
                            r.windowOpen ? "text-amber-700" : "text-red-600"
                          }`}
                        >
                          {r.windowOpen ? `${r.hoursLeft}h left` : "window shut"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Free-form replies only reach someone within 24 hours of their last message. After
                  that, only an approved template gets through.
                </p>
              </Panel>
            )}

            {attention.overdueTasks.length > 0 && (
              <Panel
                icon={ListChecks}
                title="Overdue tasks"
                count={attention.overdueTasks.length}
                tone="amber"
              >
                <ul className="space-y-1.5 text-sm">
                  {attention.overdueTasks.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/contacts/${t.contactId}`}
                        className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-1.5 hover:border-ring"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{t.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {t.contactName ?? "—"}
                            {t.assignedRole && ` · ${t.assignedRole}`}
                          </span>
                        </span>
                        {t.dueAt && (
                          <span className="shrink-0 text-[11px] text-amber-700">
                            {new Date(t.dueAt).toLocaleDateString()}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {attention.failedSends.length > 0 && (
              <Panel
                icon={AlertTriangle}
                title="Messages that never arrived"
                count={attention.failedSends.length}
                tone="red"
              >
                <ul className="space-y-1.5 text-sm">
                  {attention.failedSends.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/contacts/${m.contactId}`}
                        className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-1.5 hover:border-ring"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">
                            {m.contactName ?? m.contactPhone ?? "Unknown"}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {m.templateName ?? "Free-form text"}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-red-600">
                          {m.status === "skipped_no_consent" ? "no consent" : "failed"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Meta&apos;s reason is written to the worker log at send time — check there for the
                  exact rejection.
                </p>
              </Panel>
            )}

            {attention.failedRuns.length > 0 && (
              <Panel
                icon={XCircle}
                title="Failed automation runs"
                count={attention.failedRuns.length}
                tone="red"
              >
                <ul className="space-y-1.5 text-sm">
                  {attention.failedRuns.map((r) => (
                    <li key={r.id}>
                      <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-1.5">
                        <span className="min-w-0">
                          <span className="font-medium">{r.flowName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.contactName ?? "—"}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {new Date(r.startedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

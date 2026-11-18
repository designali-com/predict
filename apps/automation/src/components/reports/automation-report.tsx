"use client"

import { useEffect, useState } from "react"
import { Bot, CalendarCheck, CheckCheck, Eye, IndianRupee, MessageCircleReply, Send, UserCheck, Users } from "lucide-react"
import { PredictSpinner } from "@/src/components/predict-loader"

/**
 * Reports → WhatsApp automation. Message to money, flow by flow, week by week.
 * The numbers come from src/lib/automation-report (see there for the rules).
 */

interface Counts {
  entered: number
  sent: number
  delivered: number
  read: number
  replied: number
  booked: number
  visited: number
  paid: number
  revenueInPaise: number
}
interface Flow extends Counts {
  id: string
  name: string
  status: string
  trigger: string
}
interface Week extends Counts {
  week: string
}
interface Step {
  step: string
  day: number
  sent: number
  delivered: number
  read: number
  failed: number
  replied: number
}
interface Report {
  weeks: number
  flowId: string | null
  flows: Flow[]
  weekly: Week[]
  steps: Step[]
}

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)
const fmtPct = (n: number, d: number) => (d > 0 ? `${pct(n, d).toFixed(pct(n, d) < 10 ? 1 : 0)}%` : "—")
const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`

/** "9–15 Nov" from the Monday. */
function weekLabel(monday: string) {
  const start = new Date(`${monday}T00:00:00`)
  const end = new Date(start.getTime() + 6 * 86_400_000)
  const sameMonth = start.getMonth() === end.getMonth()
  const s = start.toLocaleDateString("en-IN", { day: "numeric", ...(sameMonth ? {} : { month: "short" }) })
  const e = end.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  return `${s}–${e}`
}

const TRIGGER: Record<string, string> = {
  LEAD_STATUS_NEW: "New lead",
  APPOINTMENT_CREATED: "Appointment booked",
  COMMUNICATION_BUTTON_CLICKED: "Button tapped",
}

/** The funnel steps, in order, with what each is counted against. */
const STAGES: { key: keyof Counts; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { key: "entered", label: "Entered the flow", icon: Users, hint: "people whose run started" },
  { key: "sent", label: "Sent a message", icon: Send, hint: "at least one" },
  { key: "delivered", label: "Delivered", icon: CheckCheck, hint: "at least one reached the phone" },
  { key: "read", label: "Read", icon: Eye, hint: "at least one opened" },
  { key: "replied", label: "Replied", icon: MessageCircleReply, hint: "wrote or tapped a button" },
  { key: "booked", label: "Booked", icon: CalendarCheck, hint: "an appointment after entering" },
  { key: "visited", label: "Visited", icon: UserCheck, hint: "came to the clinic" },
  { key: "paid", label: "Paid", icon: IndianRupee, hint: "any payment after entering" },
]

export function AutomationReport({ scope }: { scope: "clinic" | "all" }) {
  const [weeks, setWeeks] = useState(8)
  const [flowId, setFlowId] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    const params = new URLSearchParams({ weeks: String(weeks), scope })
    if (flowId) params.set("flowId", flowId)
    fetch(`/api/reports/automation?${params}`)
      .then((r) => r.json())
      .then((d) => live && d?.flows && setReport(d))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [weeks, flowId, scope])

  if (!report) {
    return (
      <div className="flex justify-center py-16">
        <PredictSpinner />
      </div>
    )
  }

  const flow = report.flows.find((f) => f.id === report.flowId)
  const totals = report.weekly.reduce<Counts>(
    (t, w) => {
      for (const s of STAGES) t[s.key] += w[s.key]
      t.revenueInPaise += w.revenueInPaise
      return t
    },
    { entered: 0, sent: 0, delivered: 0, read: 0, replied: 0, booked: 0, visited: 0, paid: 0, revenueInPaise: 0 },
  )

  return (
    <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Flow
          <select
            value={report.flowId ?? ""}
            onChange={(e) => setFlowId(e.target.value || null)}
            className="h-8 max-w-[18rem] rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {report.flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Period
          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {[4, 8, 12, 26].map((w) => (
              <option key={w} value={w}>
                Last {w} weeks
              </option>
            ))}
          </select>
        </label>
        {loading && <PredictSpinner className="size-4" />}
      </div>

      {report.flows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No automation ran in this period.
        </p>
      ) : (
        <>
          {/* 1 — Every flow, side by side. */}
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Bot className="h-4 w-4 text-primary" /> Every automation
            </h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Flow</th>
                    <th className="px-3 py-2 text-right font-medium">Entered</th>
                    <th className="px-3 py-2 text-right font-medium">Delivered</th>
                    <th className="px-3 py-2 text-right font-medium">Read</th>
                    <th className="px-3 py-2 text-right font-medium">Replied</th>
                    <th className="px-3 py-2 text-right font-medium">Booked</th>
                    <th className="px-3 py-2 text-right font-medium">Visited</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.flows.map((f) => {
                    const on = f.id === report.flowId
                    return (
                      <tr
                        key={f.id}
                        onClick={() => setFlowId(f.id)}
                        className={`cursor-pointer ${on ? "bg-primary/[0.06]" : "hover:bg-muted/40"}`}
                        aria-selected={on}
                      >
                        <td className="px-3 py-2.5">
                          <div className={`font-medium ${on ? "text-primary" : ""}`}>{f.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {TRIGGER[f.trigger] ?? f.trigger} · {f.status}
                          </div>
                        </td>
                        <Cell n={f.entered} />
                        <Cell n={f.delivered} of={f.entered} />
                        <Cell n={f.read} of={f.entered} />
                        <Cell n={f.replied} of={f.entered} />
                        <Cell n={f.booked} of={f.entered} />
                        <Cell n={f.visited} of={f.entered} />
                        <Cell n={f.paid} of={f.entered} />
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">{f.revenueInPaise ? rupees(f.revenueInPaise) : "—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Percentages are of the people who entered. Tap a flow to see it week by week below.
            </p>
          </section>

          {flow && (
            <>
              {/* 2 — The selected flow's funnel, step to step. */}
              <section className="space-y-2">
                <h2 className="text-sm font-medium">
                  {flow.name} — the funnel, last {report.weeks} weeks
                </h2>
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Step</th>
                        <th className="px-3 py-2 text-right font-medium">People</th>
                        <th className="hidden px-3 py-2 font-medium sm:table-cell">Of everyone</th>
                        <th className="px-3 py-2 text-right font-medium">From the step above</th>
                        <th className="px-3 py-2 text-right font-medium">Lost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {STAGES.map((s, i) => {
                        const value = totals[s.key]
                        const prev = i === 0 ? value : totals[STAGES[i - 1]!.key]
                        const lost = Math.max(0, prev - value)
                        const keep = pct(value, prev)
                        const Icon = s.icon
                        return (
                          <tr key={s.key}>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2 font-medium">
                                <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {s.label}
                              </div>
                              <div className="pl-5.5 text-[11px] text-muted-foreground">{s.hint}</div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{value.toLocaleString("en-IN")}</td>
                            <td className="hidden w-[30%] px-3 py-2.5 sm:table-cell">
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct(value, totals.entered)}%` }} />
                                </div>
                                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{fmtPct(value, totals.entered)}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{i === 0 ? "—" : fmtPct(value, prev)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {i === 0 || lost === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className={keep < 40 ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                                  −{lost.toLocaleString("en-IN")}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="border-t border-border bg-muted/30">
                      <tr>
                        <td className="px-3 py-2.5 font-medium">Revenue from these people</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums" colSpan={4}>
                          {rupees(totals.revenueInPaise)}
                          {totals.entered > 0 && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {rupees(totals.revenueInPaise / totals.entered)} per person who entered
                            </span>
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  A lost step in red keeps under 40% of the step above — that is where the flow leaks most.
                </p>
              </section>

              {/* 3 — Week by week. */}
              <section className="space-y-2">
                <h2 className="text-sm font-medium">Week by week</h2>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Week they entered</th>
                        <th className="px-3 py-2 text-right font-medium">Entered</th>
                        <th className="px-3 py-2 text-right font-medium">Sent</th>
                        <th className="px-3 py-2 text-right font-medium">Delivered</th>
                        <th className="px-3 py-2 text-right font-medium">Read</th>
                        <th className="px-3 py-2 text-right font-medium">Replied</th>
                        <th className="px-3 py-2 text-right font-medium">Booked</th>
                        <th className="px-3 py-2 text-right font-medium">Visited</th>
                        <th className="px-3 py-2 text-right font-medium">Paid</th>
                        <th className="px-3 py-2 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.weekly.map((w, i) => (
                        <tr key={w.week}>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <div className="font-medium">{weekLabel(w.week)}</div>
                            {i === 0 && <div className="text-[11px] text-muted-foreground">this week — still running</div>}
                          </td>
                          <Cell n={w.entered} />
                          <Cell n={w.sent} of={w.entered} />
                          <Cell n={w.delivered} of={w.entered} warnBelow={30} />
                          <Cell n={w.read} of={w.entered} />
                          <Cell n={w.replied} of={w.entered} />
                          <Cell n={w.booked} of={w.entered} />
                          <Cell n={w.visited} of={w.entered} />
                          <Cell n={w.paid} of={w.entered} />
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums">{w.revenueInPaise ? rupees(w.revenueInPaise) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-border bg-muted/30 font-medium">
                      <tr>
                        <td className="px-3 py-2.5">All {report.weekly.length} weeks</td>
                        <Cell n={totals.entered} />
                        <Cell n={totals.sent} of={totals.entered} />
                        <Cell n={totals.delivered} of={totals.entered} />
                        <Cell n={totals.read} of={totals.entered} />
                        <Cell n={totals.replied} of={totals.entered} />
                        <Cell n={totals.booked} of={totals.entered} />
                        <Cell n={totals.visited} of={totals.entered} />
                        <Cell n={totals.paid} of={totals.entered} />
                        <td className="px-3 py-2.5 text-right tabular-nums">{rupees(totals.revenueInPaise)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Each person sits in the week they entered the flow, and their booking, visit and payment count there even
                  when they came later — so recent weeks fill in over time. Delivery under 30% is marked amber: mostly
                  Meta&apos;s limit on marketing messages.
                </p>
              </section>

              {/* 4 — Message by message. */}
              {report.steps.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-sm font-medium">Message by message</h2>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Message</th>
                          <th className="px-3 py-2 text-right font-medium">Usually sent</th>
                          <th className="px-3 py-2 text-right font-medium">Sent</th>
                          <th className="px-3 py-2 text-right font-medium">Delivered</th>
                          <th className="px-3 py-2 text-right font-medium">Read</th>
                          <th className="px-3 py-2 text-right font-medium">Failed</th>
                          <th className="px-3 py-2 text-right font-medium">Replied in 48h</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {report.steps.map((s) => (
                          <tr key={s.step}>
                            <td className="max-w-[320px] truncate px-3 py-2.5 font-medium" title={s.step}>
                              {s.step}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs text-muted-foreground">
                              {s.day === 0 ? "on entering" : `day ${s.day + 1}`}
                            </td>
                            <Cell n={s.sent} />
                            <Cell n={s.delivered} of={s.sent} warnBelow={30} />
                            <Cell n={s.read} of={s.delivered} />
                            <Cell n={s.failed} of={s.sent} />
                            <Cell n={s.replied} of={s.delivered} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Delivered and failed are of those sent; read and replied are of those delivered — a message nobody
                    received cannot be answered.
                  </p>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

/** A count, with its share underneath when there is something to share it of. */
function Cell({ n, of, warnBelow }: { n: number; of?: number; warnBelow?: number }) {
  const share = of !== undefined ? pct(n, of) : null
  const warn = warnBelow !== undefined && of && of >= 10 && share !== null && share < warnBelow
  return (
    <td className="px-3 py-2.5 text-right tabular-nums">
      <div>{n.toLocaleString("en-IN")}</div>
      {of !== undefined && (
        <div className={`text-[11px] ${warn ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
          {fmtPct(n, of)}
        </div>
      )}
    </td>
  )
}

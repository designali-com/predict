"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CalendarClock, CheckCircle2, Megaphone, Pause, Play, Server, XCircle } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"

interface Recipient {
  id: string
  phone: string
  name: string | null
  status: string
  error: string | null
  contactId: string | null
  deliveryStatus: string | null
  updatedAt: string
}

interface Report {
  campaign: {
    id: string
    name: string
    status: string
    createdAt: string
    templateName: string | null
    templateKey: string | null
    templateStatus: string | null
    scheduledAt: string | null
    retriedAt: string | null
  }
  counts: {
    total: number
    pending: number
    sent: number
    failed: number
    skipped: number
    delivered: number
    read: number
    undelivered: number
  }
  recipients: Recipient[]
}

/**
 * One campaign: send it, and watch what happens.
 *
 * Sending happens on the server — the automation worker works through the list
 * in batches, now or at a scheduled time — so a 19,000-number send does not
 * depend on this tab staying open, the laptop staying awake, or the Wi-Fi
 * holding for an hour. This page only starts, schedules, pauses and watches.
 */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function CampaignReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scheduleAt, setScheduleAt] = useState(() => {
    // Tomorrow 9:45 am — the usual morning send — as a starting point.
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 45, 0, 0)
    return toLocalInput(d)
  })

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}`)
    const data = await res.json().catch(() => null)
    if (res.ok) setReport(data)
    else setError(data?.error ?? "Could not load this campaign")
  }, [id])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  // While it is scheduled or going out, and while delivery receipts are still
  // arriving by webhook, keep the numbers fresh.
  useEffect(() => {
    if (!report) return
    const live = ["scheduled", "sending"].includes(report.campaign.status)
    const settling = report.counts.sent > report.counts.delivered + report.counts.undelivered
    if (!live && !settling) return
    const t = setInterval(load, live ? 5000 : 15000)
    return () => clearInterval(t)
  }, [report, load])

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "That did not work")
        toast.error(data?.error ?? "That did not work")
        return
      }
      toast.success(done)
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  if (!report) {
    return <p className="p-6 text-sm text-red-600">{error ?? "Not found"}</p>
  }

  const { campaign, counts, recipients } = report
  const progress = counts.total > 0 ? Math.round(((counts.total - counts.pending) / counts.total) * 100) : 0
  const status = campaign.status
  const templateReady = campaign.templateStatus === "approved"
  const due = campaign.scheduledAt ? new Date(campaign.scheduledAt).getTime() <= Date.now() : false

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={<Megaphone className="h-5 w-5" />}
        title={campaign.name}
        description={
          <>
            {campaign.templateName ?? "—"} · {counts.total.toLocaleString("en-IN")} recipients
          </>
        }
      />

      {/* What happens next, and the controls for it */}
      {counts.pending > 0 && (
        <section className="flex flex-col gap-3 rounded-md border border-border p-4">
          {!templateReady && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              Template is <b>{campaign.templateStatus ?? "not approved"}</b> on Meta. A scheduled send waits for approval
              and starts within minutes of it — nothing goes out before.
            </p>
          )}

          {status === "scheduled" && campaign.scheduledAt && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm">
                <CalendarClock className="h-4 w-4 text-primary" />
                {due ? (
                  <span>
                    <b>Starting now</b> — the server picks it up within 20 seconds
                    {!templateReady && " (once the template is approved)"}.
                  </span>
                ) : (
                  <span>
                    Scheduled for <b>{when(campaign.scheduledAt)}</b> — sends from the server; you can close this page.
                  </span>
                )}
              </p>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: "unschedule" }, "Schedule cancelled")}>
                Cancel schedule
              </Button>
            </div>
          )}

          {status === "sending" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm">
                <PredictSpinner className="size-4" />
                <span>
                  <b>Sending from the server</b> — about {counts.pending.toLocaleString("en-IN")} to go. You can close this page.
                </span>
              </p>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: "pause" }, "Paused after the current batch")}>
                <Pause /> Pause
              </Button>
            </div>
          )}

          {status === "paused" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                <b>Paused.</b> {counts.pending.toLocaleString("en-IN")} still to send.
              </p>
              <Button size="sm" disabled={busy || !templateReady} onClick={() => act({ action: "resume" }, "Resumed")}>
                <Play /> Resume
              </Button>
            </div>
          )}

          {(status === "draft" || status === "scheduled" || status === "paused") && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                {status === "scheduled" ? "Change the time" : "Send at"}
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  min={toLocalInput(new Date())}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
                />
              </label>
              <Button
                size="sm"
                disabled={busy || !scheduleAt}
                onClick={() =>
                  act({ action: "schedule", at: new Date(scheduleAt).toISOString() }, `Scheduled for ${when(new Date(scheduleAt).toISOString())}`)
                }
              >
                <CalendarClock /> {status === "scheduled" ? "Reschedule" : "Schedule"}
              </Button>
              {status === "draft" && (
                <Button size="sm" variant="outline" disabled={busy || !templateReady} onClick={() => act({ action: "send_now" }, "Sending from the server")}>
                  <Server /> Send now
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {campaign.scheduledAt && (
        <p className="text-xs text-muted-foreground">
          {campaign.retriedAt
            ? `Failed and undelivered numbers were sent once more on ${when(campaign.retriedAt)}.`
            : "Numbers that fail or are not delivered are tried once more, automatically, 30 minutes after the send finishes."}
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-md border border-border p-4">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-medium">
            {counts.total - counts.pending} of {counts.total} processed
          </span>
          <span className="tabular-nums text-muted-foreground">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted/5">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Queued" value={counts.pending} />
        <Stat label="Sent" value={counts.sent} />
        <Stat label="Delivered" value={counts.delivered} />
        <Stat label="Read" value={counts.read} />
        <Stat label="Failed" value={counts.failed + counts.undelivered} tone="bad" />
        <Stat label="Skipped" value={counts.skipped} />
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">Number</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs tabular-nums">
                  {r.contactId ? (
                    <Link href={`/contacts/${r.contactId}`} className="hover:underline">
                      {r.phone}
                    </Link>
                  ) : (
                    r.phone
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.name ?? "—"}</td>
                <td className="px-3 py-2">
                  <StatusPill status={r.deliveryStatus ?? r.status} />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.error ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {recipients.length >= 1000 && (
        <p className="text-xs text-muted-foreground">
          Showing the first 1000 recipients. The counts above cover all of them.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div
        className={`mt-1.5 text-2xl font-medium tabular-nums ${
 tone === "bad" && value > 0 ? "text-red-600 dark:text-red-400" : ""
 }`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const good = status === "delivered" || status === "read" || status === "sent"
  const bad = status === "failed"
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
 bad
 ? "border-red-300 text-red-600 dark:border-red-900 dark:text-red-400"
 : good
 ? "border-emerald-300 text-emerald-700 dark:border-emerald-900 dark:text-emerald-400"
 : "border-border text-muted-foreground "
 }`}
    >
      {bad ? <XCircle className="h-3 w-3" /> : good ? <CheckCircle2 className="h-3 w-3" /> : null}
      {status}
    </span>
  )
}

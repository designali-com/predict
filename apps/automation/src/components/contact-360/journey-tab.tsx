"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useState } from "react"
import Link from "next/link"

interface EventRow {
  id: string
  type: string
  payload: string
  occurredAt: string
}

interface RunRow {
  id: string
  status: string
  startedAt: string
  completedAt: string | null
  currentNodeLabel: string | null
  currentNodeKind: string | null
  resumeAt: string | null
  waitingForReply: boolean
  waitingForEventType: string | null
  flowName: string
  /** Why this flow does not message them (a Kolkata lead in a nurture). */
  blockedReason?: string | null
}

const STATUS_STYLE: Record<string, string> = {
  running: "text-blue-600",
  waiting: "text-amber-600",
  completed: "text-green-600",
  failed: "text-red-600",
}

/** What a parked run is blocked on, in words rather than columns. */
function waitingLabel(run: RunRow): string | null {
  if (run.status !== "waiting") return null
  if (run.waitingForReply) {
    return run.resumeAt
      ? `waiting for a reply — times out ${new Date(run.resumeAt).toLocaleString()}`
      : "waiting for a reply — no timeout, parked until they answer"
  }
  if (run.waitingForEventType) return `waiting for ${run.waitingForEventType}`
  if (run.resumeAt) return `delayed until ${new Date(run.resumeAt).toLocaleString()}`
  return null
}

export function JourneyTab({ contactId }: { contactId: string }) {
  const [data, setData] = useState<{ events: EventRow[]; runs: RunRow[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/contacts/${contactId}/journey`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [contactId])

  if (loading || !data) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Automation runs
        </h2>
        {data.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No flow has run for this contact.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.runs.map((run) => {
              const waiting = waitingLabel(run)
              return (
                <li key={run.id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{run.flowName}</span>
                    <span
                      className={`text-xs font-medium ${STATUS_STYLE[run.status] ?? "text-muted-foreground"}`}
                    >
                      {run.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Started {new Date(run.startedAt).toLocaleString()}
                    {run.completedAt && ` · finished ${new Date(run.completedAt).toLocaleString()}`}
                  </p>
                  {run.currentNodeLabel && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      At <span className="font-medium text-muted-foreground">{run.currentNodeLabel}</span>
                      {run.currentNodeKind && ` (${run.currentNodeKind})`}
                    </p>
                  )}
                  {run.blockedReason ? (
                    <p className="mt-1 inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      Stopped · {run.blockedReason}
                    </p>
                  ) : (
                    waiting && <p className="mt-0.5 text-xs text-amber-700">{waiting}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Event timeline
        </h2>
        {data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events recorded.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.events.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-1.5"
              >
                <span className="font-medium">{e.type}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(e.occurredAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

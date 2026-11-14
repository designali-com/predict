"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Phone, CheckCircle2, XCircle, RotateCcw, Hand, Undo2, Bot, User as UserIcon } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { PageHeader } from "@workspace/ui/components/page-header"

interface TaskDetail {
  id: string
  title: string
  notes: string | null
  type: string
  status: string
  dueAt: string | null
  completedAt: string | null
  createdAt: string
  assignedRole: string | null
  assignedUserId: string | null
  assignedUserName: string | null
  createdByUserId: string | null
  createdByName: string | null
  createdByRunId: string | null
  contactId: string
  contactName: string | null
  contactPhone: string | null
  contactStage: string | null
  contactEngagement: string | null
}

const STAGE_STYLE: Record<string, string> = {
  LEAD: "bg-blue-100 text-blue-700",
  BOOKED: "bg-indigo-100 text-indigo-700",
  PATIENT: "bg-green-100 text-green-700",
  INACTIVE: "bg-amber-100 text-amber-700",
  LOST: "bg-muted/5 text-muted-foreground",
}

const STATUS_STYLE: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  cancelled: "bg-muted/5 text-muted-foreground",
}

const PATCH_MESSAGES: Record<string, string> = {
  release: "Task released",
  claim: "Task taken",
  done: "Task completed",
  cancelled: "Task cancelled",
  reopen: "Task reopened",
  notes: "Notes saved",
  due: "Due date updated",
}

/** Local wall-clock value for a datetime-local input, never UTC. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [raisedBy, setRaisedBy] = useState<{ flowName: string; runStatus: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [dueAt, setDueAt] = useState("")

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}`)
    const d = await res.json().catch(() => null)
    setTask(d?.task ?? null)
    setRaisedBy(d?.raisedBy ?? null)
    setNotes(d?.task?.notes ?? "")
    setDueAt(toLocalInputValue(d?.task?.dueAt ?? null))
  }, [id])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const patch = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) toast.success(PATCH_MESSAGES[key] ?? "Task updated")
      else {
        const d = await res.json().catch(() => null)
        toast.error(d?.error ?? "Couldn't update the task")
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (loading || !task) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  const overdue =
    task.status === "open" && task.dueAt !== null && new Date(task.dueAt).getTime() < Date.now()

  return (
    <div className="space-y-4">

      <PageHeader
        title={task.title}
        description={<>{task.type.replace(/_/g, " ")} · raised {new Date(task.createdAt).toLocaleString()}</>}
      >
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              STATUS_STYLE[task.status] ?? "bg-muted/5 text-muted-foreground"
            }`}
          >
            {task.status}
          </span>
          {overdue && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              overdue
            </span>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-md border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              What to do
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {task.status === "open" ? (
                <>
                  {task.assignedUserId ? (
                    <Button
                      onClick={() => patch("release", { claim: false })}
                      disabled={busy !== null} variant="outline">
                      {busy === "release" ? (
                        <PredictSpinner className="size-4" />
                      ) : (
                        <Undo2 className="h-3.5 w-3.5" />
                      )}
                      Release
                    </Button>
                  ) : (
                    <Button
                      onClick={() => patch("claim", { claim: true })}
                      disabled={busy !== null}>
                      {busy === "claim" ? (
                        <PredictSpinner className="size-4" />
                      ) : (
                        <Hand className="h-3.5 w-3.5" />
                      )}
                      Take this
                    </Button>
                  )}
                  <Button
                    onClick={() => patch("done", { status: "done" })}
                    disabled={busy !== null} variant="outline" className="text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Mark done
                  </Button>
                  <Button
                    onClick={() => patch("cancelled", { status: "cancelled" })}
                    disabled={busy !== null} variant="outline">
                    <XCircle className="h-3.5 w-3.5" />
                    Not needed
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => patch("reopen", { status: "open" })}
                  disabled={busy !== null} variant="outline">
                  {busy === "reopen" ? (
                    <PredictSpinner className="size-4" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Reopen
                </Button>
              )}
            </div>
          </section>

          <section className="rounded-md border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Notes
            </h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="What happened, what was agreed, what to do next…"
              className="w-full resize-y rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none"
            />
            <Button
              onClick={() => patch("notes", { notes })}
              disabled={busy !== null || notes === (task.notes ?? "")} variant="outline" className="mt-2">
              {busy === "notes" && <PredictSpinner className="size-4" />}
              Save notes
            </Button>
          </section>

          <section className="rounded-md border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Due
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="rounded-md border border-border px-2.5 py-2 text-sm focus:border-ring focus:outline-none"
              />
              <Button
                onClick={() => patch("due", { dueAt: dueAt || null })}
                disabled={busy !== null || dueAt === toLocalInputValue(task.dueAt)} variant="outline">
                {busy === "due" ? "Saving…" : "Set due date"}
              </Button>
              {task.dueAt && (
                <Button
                  onClick={() => {
                    setDueAt("")
                    patch("due", { dueAt: null })
                  }}
                  disabled={busy !== null} variant="ghost">
                  Clear
                </Button>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-md border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Person
            </h2>
            <Link
              href={`/contacts/${task.contactId}`}
              className="font-medium hover:underline"
            >
              {task.contactName ?? task.contactPhone ?? "Unnamed"}
            </Link>
            {task.contactStage && (
              <span
                className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] ${
                  STAGE_STYLE[task.contactStage] ?? "bg-muted/5 text-muted-foreground"
                }`}
              >
                {task.contactStage}
              </span>
            )}
            {task.contactPhone && (
              <a
                href={`tel:+${task.contactPhone}`}
                className="mt-2 flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
              >
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                {task.contactPhone}
              </a>
            )}
            {task.contactEngagement === "DO_NOT_CONTACT" && (
              <p className="mt-2 text-xs text-red-700">
                Marked do-not-contact — marketing and reminder consent is switched off.
              </p>
            )}
          </section>

          <section className="rounded-md border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Trail
            </h2>
            <dl className="space-y-2.5 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Raised by</dt>
                <dd className="flex items-center gap-1.5">
                  {/* A task nobody remembers creating is the first thing
                      anyone asks about, so name the person or the flow. */}
                  {task.createdByName ? (
                    <>
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {task.createdByName}
                    </>
                  ) : raisedBy ? (
                    <>
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{raisedBy.flowName}</span>
                      <span className="text-xs text-muted-foreground">({raisedBy.runStatus})</span>
                    </>
                  ) : task.createdByRunId ? (
                    <>
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                      Automation
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      Not recorded — raised before this was tracked
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Claimed by</dt>
                <dd>
                  {task.assignedUserName ?? (
                    <span className="text-muted-foreground">
                      {task.assignedRole ? `Any ${task.assignedRole.replace(/_/g, " ")}` : "Nobody"}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Due</dt>
                <dd className={overdue ? "text-amber-700" : ""}>
                  {task.dueAt ? new Date(task.dueAt).toLocaleString() : "—"}
                </dd>
              </div>
              {task.completedAt && (
                <div>
                  <dt className="text-xs text-muted-foreground">Closed</dt>
                  <dd>{new Date(task.completedAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}

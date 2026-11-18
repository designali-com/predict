"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Hand, Undo2, Search, Bot, ChevronRight, X, ChevronLeft } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { PageHeader } from "@workspace/ui/components/page-header"

interface TaskRow {
  id: string
  contactId: string
  contactName: string | null
  contactPhone: string | null
  contactStage: string | null
  type: string
  title: string
  notes: string | null
  assignedRole: string | null
  assignedUserId: string | null
  assignedUserName: string | null
  createdByUserId: string | null
  createdByName: string | null
  createdByRunId: string | null
  dueAt: string | null
  status: string
  createdAt: string
}

const SCOPES = [
  { label: "Unclaimed", value: "unclaimed" },
  { label: "Mine", value: "mine" },
  { label: "All", value: "" },
]

// The queue carries two different jobs — chasing a lead who hasn't booked, and
// answering a patient who reported a problem. Which one it is changes how you
// open the call, so it is on every row.
const STAGE_STYLE: Record<string, string> = {
  LEAD: "bg-blue-100 text-blue-700",
  BOOKED: "bg-indigo-100 text-indigo-700",
  PATIENT: "bg-green-100 text-green-700",
  INACTIVE: "bg-amber-100 text-amber-700",
  LOST: "bg-muted/5 text-muted-foreground",
}

const selectClass =
  "rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"

export default function TasksPage() {
  // useSearchParams needs a Suspense boundary above it — without one Next
  // refuses to prerender the route at build time.
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      }
    >
      <TaskQueue />
    </Suspense>
  )
}

function TaskQueue() {
  const searchParams = useSearchParams()
  // A person's page links here with ?contactId=… so "All" actually means all
  // of THEIR tasks, not the whole queue.
  const contactId = searchParams.get("contactId")
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  // Landing from a person shows everything of theirs, in every state —
  // narrowing to "open + unclaimed" there would usually show an empty page.
  const [statusFilter, setStatusFilter] = useState(contactId ? "" : "open")
  const [scope, setScope] = useState(contactId ? "" : "unclaimed")
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  // A page at a time: an automation can leave hundreds of tasks behind.
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [overdueTotal, setOverdueTotal] = useState(0)

  // New filters start again from the first page.
  useEffect(() => {
    setPage(1)
  }, [statusFilter, scope, search, typeFilter, contactId, pageSize])

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (statusFilter) params.set("status", statusFilter)
    if (contactId) params.set("contactId", contactId)
    if (scope) params.set("scope", scope)
    if (search.trim()) params.set("q", search.trim())
    if (typeFilter) params.set("type", typeFilter)
    fetch(`/api/tasks?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setTasks(data.tasks ?? [])
        setTotal(data.total ?? data.tasks?.length ?? 0)
        setOverdueTotal(data.overdue ?? 0)
        // The server keeps the page inside the list (done tasks leave it).
        if (data.page && data.page !== page) setPage(data.page)
      })
      .finally(() => setLoading(false))
  }, [statusFilter, scope, search, typeFilter, contactId, page, pageSize])

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  // Built from what came back rather than hard-coded: a flow author can set any
  // task type in the Create Task node, and a fixed list would hide those.
  const [knownTypes, setKnownTypes] = useState<string[]>([])
  useEffect(() => {
    setKnownTypes((prev) => Array.from(new Set([...prev, ...tasks.map((t) => t.type)])).sort())
  }, [tasks])

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success(
          body.status === "done" ? "Task completed" : body.claim === false ? "Task released" : "Task taken",
        )
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? "Couldn't update the task")
      }
      load()
    } finally {
      setBusyId(null)
    }
  }

  // Across every page, from the server.
  const overdueCount = overdueTotal
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        description="What automation handed to a human. Take one to work it — that stops anyone else calling the same person."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {SCOPES.map((s) => (
            <Button
              key={s.value}
              onClick={() => setScope(s.value)} size="sm" variant={scope === s.value ? "default" : "outline"}>
              {s.label}
            </Button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Task, name or phone"
            className={`${selectClass} w-56 pl-8`}
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All kinds</option>
          {knownTypes.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">Any state</option>
          <option value="open">Open</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {contactId && (
          <Button size="sm" nativeButton={false} render={<Link href="/tasks" />}>
            {tasks[0]?.contactName ?? tasks[0]?.contactPhone ?? "One person"}
            <X className="h-3 w-3" />
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {total.toLocaleString("en-IN")} {total === 1 ? "task" : "tasks"}
          {overdueCount > 0 && <span className="text-amber-700"> · {overdueCount} overdue</span>}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      ) : tasks.length === 0 ? (
        <p className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
          {contactId
            ? "No tasks for this person."
            : scope === "unclaimed"
              ? `Nothing ${statusFilter || "open"} and unclaimed — the queue is clear.`
              : "No tasks match these filters."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {tasks.map((t) => {
            const overdue =
              t.status === "open" && t.dueAt && new Date(t.dueAt).getTime() < Date.now()
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                {/* The row opens the task; the buttons stay outside the link so
                    claiming does not navigate away from the queue. */}
                <Link href={`/tasks/${t.id}`} className="group min-w-0 flex-1">
                  <p className="truncate font-medium group-hover:underline">{t.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {t.contactName ?? t.contactPhone ?? "—"}
                    {t.contactStage && (
                      <span
                        className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] ${
                          STAGE_STYLE[t.contactStage] ?? "bg-muted/5 text-muted-foreground"
                        }`}
                      >
                        {t.contactStage}
                      </span>
                    )}
                    <span className="ml-1.5 inline-flex items-center gap-1 text-muted-foreground">
                      ·{" "}
                      {t.createdByName ?? (
                        <>
                          {(t.createdByRunId || !t.createdByUserId) && (
                            <Bot className="h-3 w-3" />
                          )}
                          {t.createdByRunId ? "automation" : "unknown"}
                        </>
                      )}
                    </span>
                  </p>
                </Link>

                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-xs text-muted-foreground">
                    {t.assignedUserName ?? (
                      <span className="text-muted-foreground">
                        {t.assignedRole ? `any ${t.assignedRole.replace(/_/g, " ")}` : "unclaimed"}
                      </span>
                    )}
                  </p>
                  {t.dueAt && (
                    <p className={`text-[11px] ${overdue ? "text-amber-700" : "text-muted-foreground"}`}>
                      {new Date(t.dueAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {t.status === "open" && (
                  <div className="flex shrink-0 items-center gap-2">
                    {t.assignedUserId ? (
                      <Button
                        onClick={() => patch(t.id, { claim: false })}
                        disabled={busyId === t.id}
                        title="Release"
                        aria-label="Release" variant="ghost">
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        onClick={() => patch(t.id, { claim: true })}
                        disabled={busyId === t.id}
                        title="Take this"
                        aria-label="Take this" variant="ghost" className="text-blue-600">
                        <Hand className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      onClick={() => patch(t.id, { status: "done" })}
                      disabled={busyId === t.id}
                      title="Mark done"
                      aria-label="Mark done" variant="ghost" className="text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </li>
            )
          })}
        </ul>
      )}

      {/* Pager: how many per page, where we are of how many, back and on. */}
      {!loading && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <label className="flex items-center gap-1.5">
            Show
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Tasks per page"
              className="h-8 rounded-md border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className="tabular-nums">
            {from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">
              {page} / {pages}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Next page"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

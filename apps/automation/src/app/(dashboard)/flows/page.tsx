"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Plus, FlaskConical, Pencil, Trash2 } from "lucide-react"
import { DeleteConfirmDialog } from "@/src/components/delete-confirm-dialog"
import { toast } from "@workspace/ui/components/sonner"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"
import { DailyCheckins } from "@/src/components/daily-checkins"

interface FlowRow {
  id: string
  name: string
  triggerEventType: string
  status: string
  stepCount: number
  createdAt: string
}

const ALL = "--All--"

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted/5 text-muted-foreground",
  active: "bg-green-100 text-green-700",
  inactive: "bg-amber-100 text-amber-700",
  archived: "bg-muted/5 text-muted-foreground",
}

const selectClass =
  "rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"

export default function AutomationsPage() {
  const [flows, setFlows] = useState<FlowRow[]>([])
  const [loading, setLoading] = useState(true)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testContactId, setTestContactId] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<FlowRow | null>(null)

  const [nameFilter, setNameFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState(ALL)
  const [triggerFilter, setTriggerFilter] = useState(ALL)

  const load = () => {
    setLoading(true)
    fetch("/api/flows")
      .then((res) => res.json())
      .then((data) => setFlows(data.flows ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const setStatus = async (flow: FlowRow, status: string) => {
    const res = await fetch(`/api/flows/${flow.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      toast.success("Automation status updated")
    } else {
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? "Couldn't update automation")
    }
    load()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await fetch(`/api/flows/${deleteTarget.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error ?? "Failed to delete automation")
    load()
  }

  const runTest = async (flowId: string) => {
    if (!testContactId) return
    const res = await fetch(`/api/flows/${flowId}/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId: testContactId }),
    })
    const data = await res.json()
    if (res.ok) toast.success(`Test run started (${data.runId})`)
    else toast.error(data.error ?? "Couldn't start test run")
    setTestingId(null)
  }

  const triggerOptions = useMemo(
    () => Array.from(new Set(flows.map((f) => f.triggerEventType))).sort(),
    [flows],
  )

  const filteredFlows = useMemo(() => {
    return flows.filter((f) => {
      if (nameFilter && !f.name.toLowerCase().includes(nameFilter.toLowerCase())) return false
      if (statusFilter !== ALL && f.status !== statusFilter) return false
      if (triggerFilter !== ALL && f.triggerEventType !== triggerFilter) return false
      return true
    })
  }, [flows, nameFilter, statusFilter, triggerFilter])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Automations"
        actions={
          <Button size="sm" nativeButton={false} render={<Link href="/flows/new" />}>
            <Plus />
            New Automation
          </Button>
        }
      />

      {/* Built-in automations that run on their own schedule rather than from a
          flow drawn below: the morning medicine / exercise / diet check-ins. */}
      <DailyCheckins />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={`Delete "${deleteTarget?.name ?? ""}"?`}
        description="This automation and all its run history will be permanently removed."
        onConfirm={handleDelete}
      />

      <div className="rounded-md border border-border p-4">
        <p className="mb-3 text-sm font-semibold">Filters</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Search by name</label>
            <input
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Enter automation name"
              className={`${selectClass} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${selectClass} w-full`}>
              <option value={ALL}>{ALL}</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Trigger</label>
            <select value={triggerFilter} onChange={(e) => setTriggerFilter(e.target.value)} className={`${selectClass} w-full`}>
              <option value={ALL}>{ALL}</option>
              {triggerOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      ) : filteredFlows.length === 0 ? (
        <p className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
          {flows.length === 0 ? "No automations yet. Create your first one." : "No automations match these filters."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Trigger</th>
                <th className="px-4 py-2.5">Steps</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredFlows.map((flow) => (
                <tr key={flow.id}>
                  <td className="px-4 py-3">
                    <Link href={`/flows/${flow.id}`} className="font-medium hover:underline">
                      {flow.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{flow.triggerEventType}</td>
                  <td className="px-4 py-3 text-muted-foreground">{flow.stepCount}</td>
                  <td className="px-4 py-3">
                    <select
                      value={flow.status}
                      onChange={(e) => setStatus(flow, e.target.value)}
                      className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[flow.status] ?? STATUS_STYLE.draft}`}
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="archived">Archived</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {testingId === flow.id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          autoFocus
                          placeholder="Phone number"
                          value={testContactId}
                          onChange={(e) => setTestContactId(e.target.value)}
                          className="w-40 rounded-md border border-border px-2 py-1 text-xs"
                        />
                        <Button
                          onClick={() => runTest(flow.id)} size="sm">
                          Run
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setTestingId(flow.id)} size="sm" variant="ghost">
                        <FlaskConical className="h-3.5 w-3.5" />
                        Test
                      </Button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/flows/${flow.id}`} className="text-muted-foreground hover:text-foreground" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <Button
                        onClick={() => setDeleteTarget(flow)}

                        title="Delete" variant="destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

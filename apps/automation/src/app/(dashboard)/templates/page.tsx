"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Plus, Pencil, Trash2, Eye, RefreshCw } from "lucide-react"
import { DeleteConfirmDialog } from "@/src/components/delete-confirm-dialog"
import { WhatsAppPreview, type TemplateFormState } from "@/src/components/template-builder"
import { extractPlaceholders } from "@/src/lib/whatsapp-templates"
import { toast } from "@workspace/ui/components/sonner"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

interface Template extends TemplateFormState {
  id: string
  wabaTemplateId: string | null
  qualityRating: string | null
  submissionStatus: string
  updatedAt: string
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted/5 text-muted-foreground",
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
}

const QUALITY_STYLE: Record<string, string> = {
  GREEN: "text-green-600",
  YELLOW: "text-amber-600",
  RED: "text-red-600",
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const ALL = "--All--"

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)
  const [previewTarget, setPreviewTarget] = useState<Template | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState<{ ok: boolean; text: string } | null>(null)

  const [nameFilter, setNameFilter] = useState("")
  const [categoryFilter, setCategoryFilter] = useState(ALL)
  const [typeFilter, setTypeFilter] = useState(ALL)
  const [languageFilter, setLanguageFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)

  const load = () => {
    setLoading(true)
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // Meta reviews templates asynchronously and can approve, reject, or
  // recategorise one without telling us — this pulls the current state back
  // down so the Status/Category/Quality columns stop going stale.
  const handleSync = async () => {
    setSyncing(true)
    setSyncNote(null)
    try {
      const res = await fetch("/api/templates/sync", { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setSyncNote({ ok: false, text: data?.error ?? "Could not reach WhatsApp" })
        toast.error(data?.error ?? "Could not reach WhatsApp")
        return
      }
      setSyncNote({
        ok: true,
        text:
          data.updated > 0
            ? `${data.updated} template${data.updated === 1 ? "" : "s"} updated`
            : "Everything already up to date",
      })
      toast.success(
        data.updated > 0
          ? `${data.updated} template${data.updated === 1 ? "" : "s"} synced`
          : "Templates already up to date",
      )
      if (data.updated > 0) load()
    } catch {
      setSyncNote({ ok: false, text: "Could not reach WhatsApp" })
      toast.error("Could not reach WhatsApp")
    } finally {
      setSyncing(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await fetch(`/api/templates/${deleteTarget.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error ?? "Failed to delete template")
    load()
  }

  const categoryOptions = useMemo(
    () => uniqueSorted(templates.map((t) => t.wabaCategory).filter(Boolean) as string[]),
    [templates],
  )
  const typeOptions = useMemo(
    () => uniqueSorted(templates.map((t) => t.headerType).filter(Boolean) as string[]),
    [templates],
  )
  const languageOptions = useMemo(
    () => uniqueSorted(templates.map((t) => t.language).filter(Boolean) as string[]),
    [templates],
  )
  const statusOptions = useMemo(() => uniqueSorted(templates.map((t) => t.submissionStatus)), [templates])

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (nameFilter && !t.name.toLowerCase().includes(nameFilter.toLowerCase())) return false
      if (categoryFilter !== ALL && t.wabaCategory !== categoryFilter) return false
      if (typeFilter !== ALL && t.headerType !== typeFilter) return false
      if (languageFilter !== ALL && t.language !== languageFilter) return false
      if (statusFilter !== ALL && t.submissionStatus !== statusFilter) return false
      return true
    })
  }, [templates, nameFilter, categoryFilter, typeFilter, languageFilter, statusFilter])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Templates"
        actions={
          <>
            {syncNote && (
              <span className={`text-xs ${syncNote.ok ? "text-muted-foreground" : "text-red-600"}`}>
                {syncNote.text}
              </span>
            )}
            <Button
              size="icon-sm"
              variant="outline"
              onClick={handleSync}
              disabled={syncing}
              title="Refresh status from WhatsApp"
              aria-label="Refresh status from WhatsApp"
            >
              <RefreshCw className={syncing ? "animate-spin" : undefined} />
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href="/templates/new" />}>
              <Plus />
              New Template
            </Button>
          </>
        }
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={`Delete "${deleteTarget?.name ?? ""}"?`}
        description="This template will be permanently removed and can no longer be used in any automation."
        onConfirm={handleDelete}
      />

      <TemplatePreviewDialog template={previewTarget} onOpenChange={(open) => !open && setPreviewTarget(null)} />

      <div className="rounded-md border border-border p-4">
        <p className="mb-3 text-sm font-semibold">Filters</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Field label="Template name">
            <input
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Enter template name"
              className={selectClass}
            />
          </Field>
          <Field label="Category">
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectClass}>
              <option value={ALL}>{ALL}</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectClass}>
              <option value={ALL}>{ALL}</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Language">
            <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)} className={selectClass}>
              <option value={ALL}>{ALL}</option>
              {languageOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
              <option value={ALL}>{ALL}</option>
              {statusOptions.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <p className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
          {templates.length === 0 ? "No templates yet. Create your first one." : "No templates match these filters."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Sr.No.</th>
                <th className="px-4 py-2.5">Template ID</th>
                <th className="px-4 py-2.5">Template name</th>
                <th className="px-4 py-2.5">Quality score</th>
                <th className="px-4 py-2.5">Preview</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Language</th>
                <th className="px-4 py-2.5">Date/Time</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTemplates.map((t, i) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.wabaTemplateId ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className={`px-4 py-3 font-medium ${QUALITY_STYLE[t.qualityRating ?? ""] ?? "text-muted-foreground"}`}>
                    {t.qualityRating ?? "NA"}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      onClick={() => setPreviewTarget(t)} size="sm" variant="ghost" className="text-blue-600">
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </Button>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t.wabaCategory ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.language ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDateTime(t.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[t.submissionStatus] ?? STATUS_STYLE.draft}`}
                    >
                      {t.submissionStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/templates/${t.id}`} className="text-muted-foreground hover:text-foreground" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <Button
                        onClick={() => setDeleteTarget(t)}

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

const selectClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort()
}

function TemplatePreviewDialog({
  template,
  onOpenChange,
}: {
  template: Template | null
  onOpenChange: (open: boolean) => void
}) {
  const placeholders = useMemo(() => extractPlaceholders(template?.bodyText ?? ""), [template?.bodyText])

  return (
    <Dialog open={template !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{template?.name}</DialogTitle>
        </DialogHeader>
        {template && <WhatsAppPreview form={template} placeholders={placeholders} />}
      </DialogContent>
    </Dialog>
  )
}

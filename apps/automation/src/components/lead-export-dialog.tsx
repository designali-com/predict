"use client"

import { useEffect, useState } from "react"
import { Download, FileSpreadsheet, FileText } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { EXPORT_COLUMNS, isExportColumn, type ExportColumnKey } from "@/src/lib/lead-export-columns"

const SAVED = "ops.leadExport.columns"
const ALL_KEYS = EXPORT_COLUMNS.map((c) => c.key) as ExportColumnKey[]

/**
 * Export the people list: pick the columns, the format, and whether it is
 * everyone the current filters select or only the ticked rows. The filters
 * are read from the page's own URL, which always mirrors what is on screen.
 */
export function LeadExportDialog({
  open,
  onOpenChange,
  side,
  total,
  selectedIds,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  side: "leads" | "patients"
  total: number
  selectedIds: string[]
}) {
  const [columns, setColumns] = useState<ExportColumnKey[]>(ALL_KEYS)
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx")
  const [scope, setScope] = useState<"filtered" | "selected">("filtered")
  const [busy, setBusy] = useState(false)

  // The last choice of columns is remembered on this browser.
  useEffect(() => {
    if (!open) return
    setScope(selectedIds.length ? "selected" : "filtered")
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED) ?? "null")
      if (Array.isArray(saved)) {
        const keys = saved.filter((k): k is ExportColumnKey => typeof k === "string" && isExportColumn(k))
        if (keys.length) setColumns(keys)
      }
    } catch {}
  }, [open, selectedIds.length])

  const toggle = (key: ExportColumnKey) =>
    setColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  const count = scope === "selected" ? selectedIds.length : total

  async function download() {
    if (!columns.length) return toast.error("Pick at least one column")
    setBusy(true)
    try {
      try {
        localStorage.setItem(SAVED, JSON.stringify(columns))
      } catch {}
      const params = new URLSearchParams(window.location.search)
      params.delete("page")
      params.delete("limit")
      params.set("list", side)
      params.set("columns", columns.join(","))
      params.set("format", format)
      if (scope === "selected") params.set("ids", selectedIds.join(","))

      const res = await fetch(`/api/leads/export?${params.toString()}`)
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || "Export failed")
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `${side}.${format}`
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${count} ${count === 1 ? "row" : "rows"}`)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export {side}</DialogTitle>
          <DialogDescription className="sr-only">Export {side}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Rows</p>
            <div className="grid gap-1.5">
              <Choice checked={scope === "filtered"} onClick={() => setScope("filtered")}>
                All {total} matching the current filters
              </Choice>
              <Choice
                checked={scope === "selected"}
                onClick={() => selectedIds.length && setScope("selected")}
                disabled={!selectedIds.length}
              >
                Only the {selectedIds.length} ticked {selectedIds.length === 1 ? "row" : "rows"}
                {!selectedIds.length && " (tick rows in the list first)"}
              </Choice>
            </div>
          </section>

          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                Columns ({columns.length}/{ALL_KEYS.length})
              </p>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setColumns(ALL_KEYS)}>
                  Select all
                </button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setColumns([])}>
                  Clear
                </button>
              </div>
            </div>
            <div className="grid max-h-64 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-3">
              {EXPORT_COLUMNS.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={columns.includes(c.key)}
                    onChange={() => toggle(c.key)}
                    className="size-3.5 accent-primary"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Format</p>
            <div className="grid grid-cols-2 gap-2">
              <Choice checked={format === "xlsx"} onClick={() => setFormat("xlsx")}>
                <FileSpreadsheet className="size-4" /> Excel (.xlsx)
              </Choice>
              <Choice checked={format === "csv"} onClick={() => setFormat("csv")}>
                <FileText className="size-4" /> CSV
              </Choice>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={download} disabled={busy || !columns.length || count === 0}>
            <Download />
            {busy ? "Exporting…" : `Export ${count} ${count === 1 ? "row" : "rows"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Choice({
  checked,
  onClick,
  disabled,
  children,
}: {
  checked: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
      }`}
    >
      <span
        className={`flex size-3.5 shrink-0 items-center justify-center rounded-full border ${checked ? "border-primary" : "border-muted-foreground/50"}`}
      >
        {checked && <span className="size-1.5 rounded-full bg-primary" />}
      </span>
      {children}
    </button>
  )
}

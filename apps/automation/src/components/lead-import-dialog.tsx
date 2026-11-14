"use client"
import { Button } from "@workspace/ui/components/button"

import { useEffect, useRef, useState } from "react"
import { Upload, FileSpreadsheet, AlertTriangle, Download } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"

interface ImportProblem {
  row: number
  value: string
  reason: string
}

interface ImportSummary {
  fileRows: number
  truncated: boolean
  willCreate: number
  willUpdate: number
  alreadyPresent: number
  duplicatesInFile: number
  invalidPhones: number
  detectedColumns: Record<string, string>
  problems: ImportProblem[]
  problemCount: number
  created?: number
  updated?: number
}

interface LeadImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

const inputClass =
  "w-full rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none"

/**
 * Two-step CSV import: the file is always dry-run first so the operator sees
 * how the columns were read and how many rows are new *before* anything is
 * written. The server parses in both passes — the preview and the import can
 * never disagree about what the file said.
 */
export function LeadImportDialog({ open, onOpenChange, onImported }: LeadImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [csv, setCsv] = useState("")
  const [source, setSource] = useState("")
  const [campaign, setCampaign] = useState("")
  const [preview, setPreview] = useState<ImportSummary | null>(null)
  const [done, setDone] = useState<ImportSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setFileName("")
      setCsv("")
      setSource("")
      setCampaign("")
      setPreview(null)
      setDone(null)
      setBusy(false)
      setError(null)
      if (fileRef.current) fileRef.current.value = ""
    }
  }, [open])

  const post = async (dryRun: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, dryRun, source, campaign }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Import failed")
      return data as ImportSummary
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (file: File) => {
    setError(null)
    setPreview(null)
    setDone(null)
    setFileName(file.name)
    const text = await file.text()
    setCsv(text)
  }

  const handlePreview = async () => {
    try {
      setPreview(await post(true))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file")
    }
  }

  const handleImport = async () => {
    try {
      const result = await post(false)
      setDone(result)
      toast.success("Leads imported")
      onImported()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
      toast.error(err instanceof Error ? err.message : "Import failed")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
          <DialogDescription className="sr-only">Import leads from a CSV file</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border px-3 py-2">
          <p className="text-xs text-muted-foreground">Start from the sample so every column is read correctly.</p>
          <Button size="sm" variant="outline" onClick={downloadSample}>
            <Download />
            Download sample
          </Button>
        </div>

        {!done && (
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border px-4 py-6 text-sm hover:bg-muted/40">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <span className={fileName ? "font-medium" : "text-muted-foreground"}>
                {fileName || "Choose a .csv file"}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleFile(file)
                }}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Source (optional)</label>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. SOCIAL_MEDIA"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Campaign (optional)</label>
                <input
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value)}
                  placeholder="e.g. jan-diabetes"
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Used only for rows where the file has no such column of its own.
            </p>
          </div>
        )}

        {preview && !done && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Columns read</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(preview.detectedColumns).map(([header, field]) => (
                  <span
                    key={header}
                    className="rounded bg-muted/5 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {header} → {field}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat label="New" value={preview.willCreate} tone="text-green-700" />
              <Stat label="Update" value={preview.willUpdate} />
              <Stat label="Already in CRM" value={preview.alreadyPresent} />
              <Stat
                label="Skipped"
                value={preview.duplicatesInFile + preview.invalidPhones}
                tone={preview.duplicatesInFile + preview.invalidPhones > 0 ? "text-amber-700" : ""}
              />
            </div>

            {preview.truncated && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                File has {preview.fileRows} rows — only the first 5000 will be imported.
              </p>
            )}

            {preview.problems.length > 0 && <ProblemList summary={preview} />}
          </div>
        )}

        {done && (
          <div className="space-y-3 rounded-md border border-green-200 bg-green-50 p-3">
            <p className="text-sm font-medium text-green-800">
              Imported — {done.created ?? 0} new, {done.updated ?? 0} updated.
            </p>
            {done.problemCount > 0 && <ProblemList summary={done} />}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            onClick={() => onOpenChange(false)} variant="outline">
            {done ? "Close" : "Cancel"}
          </Button>

          {!done && !preview && (
            <Button
              type="button"
              onClick={handlePreview}
              disabled={!csv || busy}>
              {busy && <PredictSpinner className="size-4" />}
              Preview
            </Button>
          )}

          {!done && preview && (
            <Button
              type="button"
              onClick={handleImport}
              disabled={busy || preview.willCreate + preview.willUpdate === 0}>
              {busy ? <PredictSpinner className="size-4" /> : <Upload className="h-4 w-4" />}
              Import {preview.willCreate + preview.willUpdate}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded bg-muted px-2 py-1.5">
      <p className={`text-lg font-medium ${tone}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function ProblemList({ summary }: { summary: ImportSummary }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        {summary.problemCount} row{summary.problemCount === 1 ? "" : "s"} needed attention
        {summary.problemCount > summary.problems.length && ` (showing first ${summary.problems.length})`}
      </p>
      <div className="max-h-32 space-y-0.5 overflow-y-auto">
        {summary.problems.map((problem) => (
          <p key={`${problem.row}-${problem.value}`} className="text-[11px] text-muted-foreground">
            <span className="font-mono">Row {problem.row}</span>
            {problem.value && <span className="text-muted-foreground"> · {problem.value}</span>} —{" "}
            {problem.reason}
          </p>
        ))}
      </div>
    </div>
  )
}

/**
 * A ready-to-fill CSV with every column the import reads, in the names it
 * recognises. Phone numbers carry + and spaces so Excel keeps them as text
 * instead of turning 919876543210 into 9.19E+11.
 */
function downloadSample() {
  const rows = [
    ["Name", "Phone", "Email", "Source", "Platform", "Campaign", "Referral Code"],
    ["Rahul Sharma", "+91 98765 43210", "rahul@example.com", "SOCIAL_MEDIA", "FACEBOOK", "knee pain | MM", ""],
    ["Priya Das", "+91 91234 56789", "", "WEBSITE", "WEBSITE", "knee pain | Kol | MM", "REF123"],
  ]
  const csv = "﻿" + rows.map((r) => r.map((v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\r\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = "leads-import-sample.csv"
  a.click()
  URL.revokeObjectURL(url)
}

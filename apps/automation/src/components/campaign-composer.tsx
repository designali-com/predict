"use client"
import { Button } from "@workspace/ui/components/button"

import { useMemo, useRef, useState } from "react"
import { AlertTriangle, FileSpreadsheet, Upload, X } from "lucide-react"
import * as XLSX from "xlsx"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"

interface TemplateOption {
  id: string
  name: string
  key: string
  channel: string
  submissionStatus: string
  bodyText: string | null
}

interface ParsedRow {
  phone: string
  name: string | null
}

/**
 * Turn a spreadsheet into a campaign.
 *
 * The file is read in the browser: a 900-row sheet is a rounding error to
 * parse locally, and uploading the raw file would mean a second place that has
 * to understand xlsx quirks. What crosses the wire is a list of {phone, name}.
 *
 * Columns are matched by header rather than by position, because nobody's
 * export puts them in the same order twice.
 */
const PHONE_HEADERS = ["phone", "mobile", "number", "contact", "whatsapp", "phone number", "mobile number"]
const NAME_HEADERS = ["name", "full name", "patient", "patient name", "first name"]

function pickColumn(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map((h) => ({ raw: h, key: h.trim().toLowerCase() }))
  for (const candidate of candidates) {
    const hit = normalized.find((h) => h.key === candidate)
    if (hit) return hit.raw
  }
  // Nothing matched exactly — accept a header that contains the word, so
  // "Mobile No." and "Patient Phone" still land.
  for (const candidate of candidates) {
    const hit = normalized.find((h) => h.key.includes(candidate))
    if (hit) return hit.raw
  }
  return null
}

export function CampaignComposer({
  templates,
  onCreated,
  onClose,
}: {
  templates: TemplateOption[]
  onCreated: (id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [skippedRows, setSkippedRows] = useState(0)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  )

  const approved = templates.filter((t) => t.submissionStatus === "approved")
  // In Meta review: the list can be loaded and the send scheduled meanwhile —
  // the server holds a scheduled send until the template is approved.
  const inReview = templates.filter((t) => t.submissionStatus === "pending")

  async function handleFile(file: File) {
    setParseError(null)
    setFileName(file.name)
    try {
      const book = XLSX.read(await file.arrayBuffer())
      const sheet = book.Sheets[book.SheetNames[0]!]
      if (!sheet) throw new Error("That file has no sheets in it")

      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
      if (!json.length) throw new Error("That sheet is empty")

      const headers = Object.keys(json[0]!)
      const phoneKey = pickColumn(headers, PHONE_HEADERS)
      if (!phoneKey) {
        throw new Error(
          `No phone column found. Headers were: ${headers.join(", ")}. Name one of them "phone".`,
        )
      }
      const nameKey = pickColumn(headers, NAME_HEADERS)

      const parsed: ParsedRow[] = []
      let skipped = 0
      for (const row of json) {
        const phone = String(row[phoneKey] ?? "").trim()
        if (!phone) {
          skipped++
          continue
        }
        const person = nameKey ? String(row[nameKey] ?? "").trim() : ""
        parsed.push({ phone, name: person || null })
      }

      setRows(parsed)
      setSkippedRows(skipped)
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""))
    } catch (err) {
      setRows([])
      setParseError(err instanceof Error ? err.message : "Could not read that file")
    }
  }

  async function create() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, templateId, rows }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not create the campaign")
        toast.error(data?.error ?? "Could not create the campaign")
        return
      }
      toast.success("Campaign created")
      onCreated(data.id)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">New campaign</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Upload a list, pick an approved template, send.
            </p>
          </div>
          <Button onClick={onClose} variant="ghost">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="August knee campaign"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-ring"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Template
            </span>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-ring"
            >
              <option value="">Choose…</option>
              {approved.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              {inReview.length > 0 && (
                <optgroup label="In Meta review — schedule only">
                  {inReview.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (pending)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {template?.submissionStatus === "pending" && (
              <span className="mt-1 block text-xs text-amber-600">
                Still in Meta review. Create the campaign and schedule it — it waits for approval before anything goes out.
              </span>
            )}
            {approved.length === 0 && inReview.length === 0 && (
              <span className="mt-1 block text-xs text-amber-600">
                No approved templates yet. WhatsApp rejects every message sent on a template it has
                not approved, so there is nothing to send until one comes through.
              </span>
            )}
            {template?.bodyText && (
              <p className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {template.bodyText}
              </p>
            )}
          </label>

          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Recipients
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
            <Button
              type="button"
              onClick={() => fileRef.current?.click()} variant="outline" className="h-auto w-full justify-start whitespace-normal text-left w-full">
              <Upload className="h-4 w-4" />
              {fileName ?? "Choose an .xlsx or .csv file"}
            </Button>

            {parseError && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {parseError}
              </p>
            )}

            {rows.length > 0 && (
              <div className="mt-3 rounded-md border border-border">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{rows.length} rows</span>
                  {skippedRows > 0 && (
                    <span className="text-xs text-muted-foreground">
                      · {skippedRows} with no number ignored
                    </span>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto text-sm">
                  {rows.slice(0, 8).map((r, i) => (
                    <div
                      key={`${r.phone}-${i}`}
                      className="flex justify-between gap-3 border-b border-border px-3 py-1.5 last:border-0"
                    >
                      <span className="tabular-nums">{r.phone}</span>
                      <span className="text-muted-foreground">{r.name ?? "—"}</span>
                    </div>
                  ))}
                  {rows.length > 8 && (
                    <p className="px-3 py-1.5 text-xs text-muted-foreground">
                      and {rows.length - 8} more
                    </p>
                  )}
                </div>
              </div>
            )}

            <p className="mt-2 text-xs text-muted-foreground">
              Needs a <strong>phone</strong> column; a <strong>name</strong> column is used if
              present. Duplicates and unusable numbers are dropped when the campaign is created,
              and the count is shown before anything sends.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button
            onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={create}
            disabled={creating || !name.trim() || !templateId || rows.length === 0}>
            {creating && <PredictSpinner className="size-4" />}
            Create campaign
          </Button>
        </div>
      </div>
    </div>
  )
}

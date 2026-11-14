"use client"

import { useCallback, useEffect, useState } from "react"
import { FileText, Trash2, Upload } from "lucide-react"
import { Button } from "@workspace/ui/components/button"

interface DocumentRow {
  id: string
  appointmentId: string | null
  fileUrl: string
  fileName: string
  mimeType: string
  kind: string
  note: string | null
  createdAt: string
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
}

/**
 * Every file on this person: PDFs, reports, X-rays and photos.
 * `url` is the list/upload endpoint. Pass `appointmentId` when the upload
 * is being filed from a visit, so the row remembers which one.
 */
export function DocumentsPanel({ url, appointmentId }: { url: string; appointmentId?: string | null }) {
  const [rows, setRows] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [dragging, setDragging] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(url)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "Could not load documents")
      setRows(data?.documents ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load documents")
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    void load()
  }, [load])

  async function onFiles(list: FileList | null) {
    if (!list?.length) return
    setBusy(true)
    setError("")
    const failures: string[] = []
    for (const file of Array.from(list)) {
      const body = new FormData()
      body.set("file", file)
      if (appointmentId) body.set("appointmentId", appointmentId)
      const res = await fetch(url, { method: "POST", body })
      const data = await res.json().catch(() => null)
      if (!res.ok) failures.push(`${file.name}: ${data?.error || "upload failed"}`)
    }
    if (failures.length) setError(failures.join(" "))
    setBusy(false)
    await load()
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove ${name}?`)) return
    setError("")
    const res = await fetch(`${url}/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error || "Could not remove the document")
      return
    }
    await load()
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragEnter={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!busy) void onFiles(e.dataTransfer.files)
        }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed px-4 py-6 text-center ${
          dragging ? "border-foreground bg-muted" : "border-border"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <Upload className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{busy ? "Uploading…" : "Drop files here, or click to choose"}</span>
        <span className="text-xs text-muted-foreground">Several at once. PDF, report, X-ray or photo. Up to 20 MB each.</span>
        <input
          type="file"
          multiple
          accept="application/pdf,image/*,.dcm,.dicom,.heic,.heif"
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            void onFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </label>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start gap-3 rounded-md border border-border px-3 py-2">
              {row.mimeType.startsWith("image/") ? (
                <a href={row.fileUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <img src={row.fileUrl} alt="" className="h-14 w-14 rounded object-cover" />
                </a>
              ) : (
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <a href={row.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline">
                  {row.fileName}
                </a>
                <p className="text-xs text-muted-foreground">
                  {when(row.createdAt)}
                  {appointmentId && row.appointmentId === appointmentId ? " · this visit" : ""}
                </p>
              </div>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove ${row.fileName}`}
                onClick={() => void remove(row.id, row.fileName)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

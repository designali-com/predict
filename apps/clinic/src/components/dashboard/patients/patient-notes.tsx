"use client"

import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { PredictSpinner } from "@/src/components/predict-loader"
import { Send, StickyNote } from "lucide-react"
import { useEffect, useState } from "react"
import { RecordSection } from "./record-ui"

interface Note {
  id: string
  content: string
  authorName: string
  authorRole: string
  createdAt: string
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Calcutta",
  })
}

/** Notes on the person. They are not filed against a visit. */
export function PatientNotes({ contactId }: { contactId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetch(`/api/staff/people/${contactId}/notes`)
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || "Could not load notes")
        if (!cancelled) setNotes(data?.notes ?? [])
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load notes")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [contactId])

  const add = async () => {
    const content = text.trim()
    if (!content) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/people/${contactId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "Could not add the note")
      if (data?.note) setNotes((current) => [data.note as Note, ...current])
      setText("")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add the note")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <RecordSection title="Notes" icon={StickyNote}>
        <div className="flex justify-center py-6">
          <PredictSpinner className="size-5" />
        </div>
      </RecordSection>
    )
  }

  return (
    <RecordSection title="Notes" icon={StickyNote}>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder="A note about this patient…"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Button
          type="button"
          size="sm"
          variant="simple"
          disabled={saving || !text.trim()}
          className="ml-auto"
          onClick={() => void add()}
        >
          {saving ? <PredictSpinner className="size-4" /> : <Send />}
          Add Note
        </Button>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {notes.length === 0 ? (
          <p className="text-sm text-black/65 dark:text-white/40">No notes yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-black/65 dark:text-white/45">
                <span className="font-semibold text-black dark:text-white">{note.authorName}</span>
                <span className="capitalize">{note.authorRole.replaceAll("_", " ")}</span>
                <span className="ml-auto">{when(note.createdAt)}</span>
              </div>
              <p className="whitespace-pre-line text-sm">{note.content}</p>
            </div>
          ))
        )}
      </div>
    </RecordSection>
  )
}

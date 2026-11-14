"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Copy, Eye, Pencil, Plus, Search, Trash2, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { ExerciseProtocolView } from "@workspace/ui/components/exercise-protocol-view"
import { emptyExerciseProtocol, kneeTemplate, type ExerciseProtocol } from "@workspace/db/exercise-protocol"
import { PredictSpinner } from "@/src/components/predict-loader"
import { ExerciseProtocolForm } from "@/src/components/dashboard/patients/exercise-protocol-form"

interface LibraryItem {
  id: string
  name: string
  protocol: ExerciseProtocol
  updatedAt: string
}

type Editing = { id: string | null; draft: ExerciseProtocol }

function copyOf(p: ExerciseProtocol, title?: string): ExerciseProtocol {
  const c = structuredClone(p)
  delete c.source
  delete c.updated
  if (title !== undefined) c.title = title
  return c
}

/**
 * The clinic's exercise prescriptions, written once and assigned to patients
 * from their Exercise tab or an appointment (as a copy they can adjust).
 */
export function ExerciseProtocolLibrary() {
  const [list, setList] = useState<LibraryItem[] | null>(null)
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<Editing | null>(null)
  const [viewing, setViewing] = useState<LibraryItem | null>(null)
  const [removing, setRemoving] = useState<LibraryItem | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/staff/exercise-protocols")
    const data = await res.json().catch(() => null)
    setList(res.ok ? (data?.protocols ?? []) : [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (list ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.protocol.goal.toLowerCase().includes(q))
  }, [list, query])

  const start = (draft: ExerciseProtocol, id: string | null = null) => {
    setError(null)
    setChoosing(false)
    setViewing(null)
    setEditing({ id, draft: { ...draft, dailyCheckIn: draft.dailyCheckIn ?? true } })
    window.scrollTo({ top: 0 })
  }

  async function save() {
    if (!editing) return
    setBusy(true)
    setError(null)
    const res = await fetch(editing.id ? `/api/staff/exercise-protocols/${editing.id}` : "/api/staff/exercise-protocols", {
      method: editing.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing.draft),
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) {
      setError(data?.error ?? "Could not save the prescription.")
      toast.error(data?.error ?? "Could not save the prescription.")
      return
    }
    toast.success(editing.id ? "Prescription updated" : "Prescription added to the library")
    setEditing(null)
    await load()
  }

  async function remove() {
    if (!removing) return
    setBusy(true)
    const res = await fetch(`/api/staff/exercise-protocols/${removing.id}`, { method: "DELETE" })
    setBusy(false)
    if (!res.ok) return toast.error("Could not remove the prescription.")
    toast.success(`Removed "${removing.name}" from the library`)
    setRemoving(null)
    await load()
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{editing.id ? `Edit "${editing.draft.title || "prescription"}"` : "New exercise prescription"}</p>
            <p className="text-xs text-muted-foreground">
              {editing.id
                ? "Patients it was already assigned to keep their own copy — this changes the library only."
                : "Saved to the library; assign it from a patient's Exercise tab or an appointment."}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setEditing(null)} disabled={busy}>
            <X />
          </Button>
        </div>
        <div className="rounded-md border border-border p-4">
          <ExerciseProtocolForm value={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border bg-background py-3">
          <Button onClick={save} disabled={busy || !editing.draft.title.trim()}>
            {busy && <PredictSpinner className="size-4" />}
            {editing.id ? "Save changes" : "Save to library"}
          </Button>
          <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prescriptions"
            className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-3 text-sm focus:border-ring focus:outline-none"
          />
        </div>
        <Button className="sm:ml-auto" onClick={() => setChoosing(true)}>
          <Plus /> New prescription
        </Button>
      </div>

      {list === null ? (
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {list.length === 0 ? "No exercise prescriptions yet. Start from the knee template to save typing." : "Nothing matches."}
          </p>
          {list.length === 0 && (
            <Button size="sm" onClick={() => setChoosing(true)}>
              <Plus /> New prescription
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <article key={p.id} className="flex flex-col gap-2 rounded-md border border-border p-3 transition-colors hover:border-ring">
              <p className="font-medium leading-snug">{p.name}</p>
              {p.protocol.goal && <p className="line-clamp-2 text-xs text-muted-foreground">{p.protocol.goal}</p>}
              <p className="text-[11px] text-muted-foreground">
                {p.protocol.exercises.length} exercises{p.protocol.duration ? ` · ${p.protocol.duration}` : ""}
              </p>
              <div className="mt-auto flex flex-wrap gap-1 pt-1">
                <Button size="sm" variant="ghost" onClick={() => setViewing(p)}>
                  <Eye /> View
                </Button>
                <Button size="sm" variant="ghost" onClick={() => start(copyOf(p.protocol), p.id)}>
                  <Pencil /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => start(copyOf(p.protocol, `${p.name} (copy)`))}>
                  <Copy /> Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-muted-foreground hover:text-red-600"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => setRemoving(p)}
                >
                  <Trash2 />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent className="flex max-h-[85svh] w-[calc(100vw-2rem)] max-w-md flex-col gap-4 overflow-hidden">
          <DialogHeader>
            <DialogTitle>New exercise prescription</DialogTitle>
            <DialogDescription>Start from a copy so you only change what differs.</DialogDescription>
          </DialogHeader>
          <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-1">
            <button
              type="button"
              onClick={() => start(kneeTemplate())}
              className="flex w-full flex-col items-start rounded-lg border border-border px-3 py-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="text-sm font-medium">Knee Strengthening Program</span>
              <span className="text-[11px] text-muted-foreground">Built-in template · 7 exercises · 6 weeks</span>
            </button>
            {(list?.length ?? 0) > 0 && (
              <section className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Copy from the library</p>
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {list!.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => start(copyOf(p.protocol, `${p.name} (copy)`))}
                        className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
                      >
                        <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <button
              type="button"
              onClick={() => start(emptyExerciseProtocol())}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> Start blank
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="flex max-h-[90svh] flex-col gap-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>As it prints for a patient</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ExerciseProtocolView protocol={viewing.protocol} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => viewing && start(copyOf(viewing.protocol, `${viewing.name} (copy)`))}>
              <Copy /> Duplicate
            </Button>
            <Button onClick={() => viewing && start(copyOf(viewing.protocol), viewing.id)}>
              <Pencil /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onOpenChange={(o) => !o && !busy && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove &quot;{removing?.name}&quot;?</DialogTitle>
            <DialogDescription>
              It disappears from the library and can no longer be assigned. Patients who already have it keep their copy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {busy && <PredictSpinner className="size-4" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

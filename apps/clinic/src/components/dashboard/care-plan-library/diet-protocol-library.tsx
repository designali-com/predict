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
import { DietProtocolSummary, DietProtocolView } from "@workspace/ui/components/diet-protocol-view"
import {
  PROTOCOL_DIETS,
  dietLabel,
  emptyProtocol,
  weightLossTemplate,
  type DietProtocol,
} from "@workspace/db/diet-protocol"
import { PredictSpinner } from "@/src/components/predict-loader"
import { DietProtocolForm } from "@/src/components/dashboard/patients/diet-protocol-form"

interface LibraryProtocol {
  id: string
  name: string
  diet: string | null
  protocol: DietProtocol
  updatedAt: string
}

/** What is open in the editor: a new protocol, or an existing one by id. */
type Editing = { id: string | null; draft: DietProtocol }

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

/** A library copy is the protocol itself, minus anything patient-specific. */
function copyOf(p: DietProtocol, title?: string): DietProtocol {
  const c = structuredClone(p)
  delete c.source
  delete c.updated
  if (title !== undefined) c.title = title
  return c
}

/**
 * The clinic's dietary protocols, written once by the nutritionist and
 * assigned to patients from their Nutrition tab (as a copy they can adjust).
 *
 * Variants (veg / egg / non-veg) are separate protocols: Duplicate one, switch
 * the diet type and swap the dishes — far less typing than starting over.
 */
export function DietProtocolLibrary() {
  const [list, setList] = useState<LibraryProtocol[] | null>(null)
  const [query, setQuery] = useState("")
  const [diet, setDiet] = useState("all")
  const [editing, setEditing] = useState<Editing | null>(null)
  const [viewing, setViewing] = useState<LibraryProtocol | null>(null)
  const [removing, setRemoving] = useState<LibraryProtocol | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/staff/diet-protocols")
    const data = await res.json().catch(() => null)
    setList(res.ok ? (data?.protocols ?? []) : [])
    if (!res.ok) setError(data?.error ?? "Could not load the library.")
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (list ?? []).filter(
      (p) =>
        (diet === "all" || p.diet === diet) &&
        (!q || p.name.toLowerCase().includes(q) || (p.protocol.badge ?? "").toLowerCase().includes(q)),
    )
  }, [list, diet, query])

  const countFor = (d: string) => (list ?? []).filter((p) => d === "all" || p.diet === d).length

  const start = (draft: DietProtocol, id: string | null = null) => {
    setError(null)
    setChoosing(false)
    setViewing(null)
    setEditing({ id, draft })
    window.scrollTo({ top: 0 })
  }

  async function save() {
    if (!editing) return
    setBusy(true)
    setError(null)
    const res = await fetch(editing.id ? `/api/staff/diet-protocols/${editing.id}` : "/api/staff/diet-protocols", {
      method: editing.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing.draft),
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) {
      setError(data?.error ?? "Could not save the protocol.")
      toast.error(data?.error ?? "Could not save the protocol.")
      return
    }
    toast.success(editing.id ? "Protocol updated" : "Protocol added to the library")
    setEditing(null)
    await load()
  }

  async function remove() {
    if (!removing) return
    setBusy(true)
    const res = await fetch(`/api/staff/diet-protocols/${removing.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) {
      toast.error(data?.error ?? "Could not remove the protocol.")
      return
    }
    toast.success(`Removed "${removing.name}" from the library`)
    setRemoving(null)
    await load()
  }

  // ---------------------------------------------------------------- editing
  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{editing.id ? `Edit "${editing.draft.title || "protocol"}"` : "New diet protocol"}</p>
            <p className="text-xs text-muted-foreground">
              {editing.id
                ? "Patients it was already assigned to keep their own copy — this changes the library only."
                : "Saved to the library; assign it to any patient from their Nutrition tab."}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setEditing(null)} disabled={busy}>
            <X />
          </Button>
        </div>
        <div className="rounded-md border border-border p-4">
          <DietProtocolForm value={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} />
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

  // ---------------------------------------------------------------- list
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search protocols"
            aria-label="Search diet protocols"
            className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-3 text-sm focus:border-ring focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[{ value: "all", label: "All" }, ...PROTOCOL_DIETS].map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDiet(d.value)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                diet === d.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {d.label}
              <span className="tabular-nums opacity-70">{countFor(d.value)}</span>
            </button>
          ))}
        </div>
        <Button className="sm:ml-auto" onClick={() => setChoosing(true)}>
          <Plus /> New protocol
        </Button>
      </div>

      {list === null ? (
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {list.length === 0 ? "No diet protocols yet. Start from the Weight Loss template to save typing." : "No protocol matches."}
          </p>
          {list.length === 0 && (
            <Button size="sm" onClick={() => setChoosing(true)}>
              <Plus /> New protocol
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <article key={p.id} className="flex flex-col gap-2 rounded-md border border-border p-3 transition-colors hover:border-ring">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium leading-snug">{p.name}</p>
                {dietLabel(p.diet) && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{dietLabel(p.diet)}</span>
                )}
              </div>
              {p.protocol.badge && <p className="line-clamp-2 text-xs text-muted-foreground">{p.protocol.badge}</p>}
              <p className="text-[11px] text-muted-foreground">
                {p.protocol.meals.length} meals a day · {p.protocol.avoid.length} foods to avoid · updated {day(p.updatedAt)}
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

      <p className="text-xs text-muted-foreground">
        Assigning copies the protocol to the patient, so it can be adjusted for them. Editing or removing a library
        protocol never changes a plan a patient already has.
      </p>

      {/* New: blank, the built-in template, or a copy of one already written */}
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent className="flex max-h-[85svh] w-[calc(100vw-2rem)] max-w-md flex-col gap-4 overflow-hidden">
          <DialogHeader>
            <DialogTitle>New diet protocol</DialogTitle>
            <DialogDescription>Start from a copy so you only change what differs.</DialogDescription>
          </DialogHeader>
          <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-1">
            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Weight Loss template</p>
              <div className="grid grid-cols-3 gap-2">
                {PROTOCOL_DIETS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => start(weightLossTemplate(d.value))}
                    className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg border border-border px-2 py-3 text-center transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <span className="text-sm font-medium">{d.label}</span>
                    <span className="text-[11px] text-muted-foreground">7-day plan</span>
                  </button>
                ))}
              </div>
            </section>

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
                        {dietLabel(p.diet) && (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{dietLabel(p.diet)}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <button
              type="button"
              onClick={() => start(emptyProtocol())}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> Start blank
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Read view, as a patient would see it */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="flex max-h-[90svh] flex-col gap-3 sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>{dietLabel(viewing?.diet) ?? "Diet type not set"} · as the patient will see it</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              <DietProtocolSummary protocol={viewing.protocol} />
              <DietProtocolView protocol={viewing.protocol} />
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

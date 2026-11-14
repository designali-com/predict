"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { PROTOCOL_DIETS, dietLabel, type DietProtocol } from "@workspace/db/diet-protocol"
import { PredictSpinner } from "@/src/components/predict-loader"

interface LibraryProtocol {
  id: string
  name: string
  diet: string | null
  protocol: DietProtocol
  updatedAt: string
}

/**
 * Pick a protocol from the Care Plan Library to start this patient's plan
 * from. What comes back is a copy (with where it came from noted) for the
 * nutritionist to adjust before saving — the library itself is untouched.
 */
export function DietProtocolPicker({
  open,
  onOpenChange,
  onPick,
  preferDiet,
  onStart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (protocol: DietProtocol) => void
  /** Pre-select a diet filter, e.g. the patient's own. */
  preferDiet?: string | null
  /** The built-in starting points: the Weight Loss template, or a blank sheet. */
  onStart?: (which: "weight_loss" | "blank") => void
}) {
  const [list, setList] = useState<LibraryProtocol[] | null>(null)
  const [diet, setDiet] = useState<string>(preferDiet ?? "all")
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!open) return
    setList(null)
    fetch("/api/staff/diet-protocols")
      .then((r) => (r.ok ? r.json() : { protocols: [] }))
      .then((d) => setList(d.protocols ?? []))
      .catch(() => setList([]))
  }, [open])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (list ?? []).filter(
      (p) =>
        (diet === "all" || p.diet === diet) &&
        (!q || p.name.toLowerCase().includes(q) || (p.protocol.badge ?? "").toLowerCase().includes(q)),
    )
  }, [list, diet, query])

  const pick = (p: LibraryProtocol) => {
    const copy: DietProtocol = structuredClone(p.protocol)
    delete copy.updated
    copy.source = { templateId: p.id, templateName: p.name }
    onPick(copy)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85svh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-3 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Assign diet protocol</DialogTitle>
          <DialogDescription>Pick a library protocol, or start from a template.</DialogDescription>
        </DialogHeader>

        {onStart && (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: "weight_loss", title: "Weight Loss template", sub: "Built-in starting point" },
                { key: "blank", title: "Start blank", sub: "Write it from scratch" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  onStart(t.key)
                  onOpenChange(false)
                }}
                className="rounded-md border border-border px-3 py-2 text-left hover:border-ring"
              >
                <span className="block text-sm font-medium">{t.title}</span>
                <span className="block text-xs text-muted-foreground">{t.sub}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search protocols"
              className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-sm focus:border-ring focus:outline-none"
            />
          </div>
          {[{ value: "all", label: "All" }, ...PROTOCOL_DIETS].map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDiet(d.value)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                diet === d.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
          {list === null ? (
            <div className="flex justify-center py-8">
              <PredictSpinner className="size-5" />
            </div>
          ) : shown.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {list.length === 0 ? (
                <>
                  The library is empty.{" "}
                  <Link href="/care-plan-library" className="font-medium text-primary hover:underline">
                    Create a protocol in the Care Plan Library
                  </Link>
                  .
                </>
              ) : (
                "No protocol matches."
              )}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => pick(p)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.protocol.badge || `${p.protocol.meals.length} meals a day · 7 days`}
                      </span>
                    </span>
                    {dietLabel(p.diet) && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{dietLabel(p.diet)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

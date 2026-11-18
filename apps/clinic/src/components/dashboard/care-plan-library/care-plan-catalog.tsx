"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Ban, RotateCcw, Search, X } from "lucide-react"
import { CARE_PLAN_ITEM_TYPES, CARE_PLAN_SLOTS } from "@workspace/db/care-plan"

interface CatalogItem {
  id: string
  type: string
  name: string
  defaultInstructions: string | null
  defaultSlots: string[]
  isActive: boolean
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:border-ring focus:outline-none"

function slotLabel(slot: string): string {
  return CARE_PLAN_SLOTS.find((c) => c.value === slot)?.label ?? slot
}

/** Name and instructions both, because "with a meal" is how people search. */
function matches(item: CatalogItem, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    item.name.toLowerCase().includes(q) ||
    (item.defaultInstructions ?? "").toLowerCase().includes(q)
  )
}

/**
 * The pick-list every assignment chooses from, maintained once here instead of
 * retyped per patient.
 *
 * Typing a name per patient produces "Vitamin D3 5000 IU", "vitamin d3 5000iu"
 * and "Vit D3" as three unrelated strings — nothing can be reported on, and a
 * dose is one keystroke from being wrong.
 *
 * Search runs against the whole library, not just the open tab, and the tab
 * counts show how many matches each type holds. Someone looking for "magnesium"
 * does not necessarily know whether it was filed as a supplement or a
 * medication, and a search that silently only covered the tab they happened to
 * be on would tell them it does not exist.
 */
export function CarePlanCatalog() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState("supplement")
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const [form, setForm] = useState({
    name: "",
    defaultInstructions: "",
    defaultSlots: ["morning"] as string[],
  })

  const load = useCallback(async () => {
    const res = await fetch("/api/staff/care-plan-catalog?includeInactive=true")
    const data = await res.json().catch(() => null)
    setItems(data?.items ?? [])
  }, [])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const found = useMemo(() => items.filter((i) => matches(i, query)), [items, query])
  const visible = useMemo(() => found.filter((i) => i.type === type), [found, type])

  // While searching the badge counts matches, so a tab with results elsewhere
  // is visible without switching to it. Otherwise it is the usual live count.
  const countFor = (t: string) =>
    query ? found.filter((i) => i.type === t).length : items.filter((i) => i.type === t && i.isActive).length

  const elsewhere = query ? found.filter((i) => i.type !== type).length : 0

  const add = async () => {
    if (!form.name.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/staff/care-plan-catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, ...form }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        setError(d?.error ?? "Could not add this item")
        return
      }
      setForm({ name: "", defaultInstructions: "", defaultSlots: ["morning"] })
      setShowAdd(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(id)
    try {
      await fetch("/api/staff/care-plan-catalog", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const typeLabel = CARE_PLAN_ITEM_TYPES.find((t) => t.value === type)?.label ?? "item"

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Supplements, medications and other items every care plan picks from.</p>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
        <div className="relative w-full min-w-[200px] sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the whole library — name or instructions"
            aria-label="Search the care plan library"
            className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-9 text-sm focus:border-ring focus:outline-none"
          />
          {query && (
            <Button variant="ghost" size="default" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
 onClick={() => setQuery("")}
 aria-label="Clear search"

 >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CARE_PLAN_ITEM_TYPES.map((t) => {
            const on = type === t.value
            const count = countFor(t.value)
            return (
              <Button variant="ghost" size="default"
                key={t.value}
                onClick={() => {
                  setType(t.value)
                  setShowAdd(false)
                  setError(null)
                }}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
 on
 ?"bg-primary text-primary-foreground"
 :"border border-border text-muted-foreground hover:border-ring"
 } ${query && count === 0 ?"opacity-40":""}`}
              >
                {t.label}
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
                    on ? "bg-primary-foreground/20" : "bg-muted"
                  }`}
                >
                  {count}
                </span>
              </Button>
            )
          })}
        </div>
        <Button variant="default" size="lg" className="active:scale-95"
 onClick={() => setShowAdd((v) => !v)}
 >
          <Plus className="h-4 w-4" />
          Add {typeLabel.toLowerCase()}
        </Button>
        </div>
      </div>

      {showAdd && (
        <section className="rounded-md border border-border p-4">
          <h2 className="mb-3 text-sm font-semibold">Add a {typeLabel.toLowerCase()}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name, e.g. Vitamin D3 5000 IU"
              className={inputClass}
            />
            <input
              value={form.defaultInstructions}
              onChange={(e) => setForm({ ...form, defaultInstructions: e.target.value })}
              placeholder="Usual instructions (optional), e.g. with a meal"
              className={inputClass}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {CARE_PLAN_SLOTS.map((s) => {
              const on = form.defaultSlots.includes(s.value)
              return (
                <Button variant="ghost" size="sm"
                  key={s.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setForm({
                      ...form,
                      defaultSlots: on
                        ? form.defaultSlots.filter((x) => x !== s.value)
                        : [...form.defaultSlots, s.value],
                    })
                  }
                  className={`border px-3 py-1.5 text-xs font-medium transition-colors ${
 on
 ?"border-transparent bg-primary text-primary-foreground"
 :"border-border text-muted-foreground hover:border-ring"
 }`}
                >
                  {s.label}
                </Button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            The usual timing — pre-filled when this is assigned, and still changeable per patient.
          </p>

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          <div className="mt-3 flex items-center gap-2">
            <Button variant="default" size="default"
 onClick={add}
 disabled={!form.name.trim() || saving}

 >
              {saving && <PredictSpinner className="size-4" />}
              Add to library
            </Button>
            <Button variant="outline" size="default"
 onClick={() => setShowAdd(false)}

 >
              Cancel
            </Button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {query
              ? `Nothing in ${typeLabel.toLowerCase()} matches “${query}”.`
              : "Nothing in this list yet."}
          </p>
          {/* The search covered every type, so say where the matches actually
              are rather than leaving them to try each tab. */}
          {elsewhere > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {elsewhere} match{elsewhere === 1 ? "" : "es"} under another type — the counts above
              show which.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((item) => (
              <article
                key={item.id}
                className={`flex flex-col gap-2 rounded-md border border-border p-3 transition-colors ${
                  item.isActive ? "hover:border-ring" : "bg-muted/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`font-medium leading-snug ${
                      item.isActive ? "" : "text-muted-foreground line-through"
                    }`}
                  >
                    {item.name}
                  </p>
                  <Button variant="ghost" size="default" className="text-muted-foreground hover:text-foreground"
 onClick={() => patch(item.id, { isActive: !item.isActive })}
 disabled={busy === item.id}
 title={
 item.isActive
 ? "Retire — hides it from the picker, existing plans keep it"
 : "Bring it back"
 }
 aria-label={item.isActive ? `Retire ${item.name}` : `Restore ${item.name}`}

 >
                    {busy === item.id ? (
                      <PredictSpinner className="size-4" />
                    ) : item.isActive ? (
                      <Ban className="h-4 w-4" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Slots as chips rather than a comma list: how many doses a day
                    is the number that gets read off this, and three chips are
                    countable at a glance where "Morning, Noon, Evening" is not. */}
                <div className="flex flex-wrap gap-1">
                  {item.defaultSlots.length > 0 ? (
                    item.defaultSlots.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {slotLabel(s)}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-muted-foreground">No default timing</span>
                  )}
                </div>

                {item.defaultInstructions && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {item.defaultInstructions}
                  </p>
                )}
              </article>
            ))}
          </div>

          {elsewhere > 0 && (
            <p className="text-xs text-muted-foreground">
              {elsewhere} more match{elsewhere === 1 ? "" : "es"} under another type — the counts
              above show which.
            </p>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Retiring an item hides it from the picker but leaves it readable on the plans that already
        use it — a patient&apos;s record should keep saying what they were actually told.
      </p>
    </div>
  )
}

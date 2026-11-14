"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Check, X, Minus, Ban } from "lucide-react"
import {
  CARE_PLAN_ITEM_TYPES,
  CARE_PLAN_SLOTS,
  ADHERENCE_RAMP,
  rampColor,
} from "@workspace/db/care-plan"
import { toast } from "@workspace/ui/components/sonner"
import { PageHeader } from "@workspace/ui/components/page-header"

interface PlanItem {
  id: string
  type: string
  name: string
  instructions: string | null
  slots: string[]
  assignedByName: string | null
  assignedRole: string | null
  startDate: string
  endDate: string | null
  isActive: boolean
}
interface DaySlot {
  itemId: string
  itemName: string
  slot: string
  status: string | null
}
interface Day {
  date: string
  expected: number
  completed: number
  rate: number | null
  slots: DaySlot[]
}
interface CatalogItem {
  id: string
  type: string
  name: string
  defaultInstructions: string | null
  defaultSlots: string[]
}
interface AdherenceData {
  from: string
  to: string
  calendar: Day[]
  overall: number | null
}

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-2 text-sm focus:border-ring focus:outline-none"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function pad(n: number) {
  return String(n).padStart(2, "0")
}
function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Monday-based column for a YYYY-MM-DD day, so weeks line up in the grid. */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00`).getDay() + 6) % 7
}

function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`
}

export default function AdherencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<AdherenceData | null>(null)
  const [items, setItems] = useState<PlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [days, setDays] = useState(30)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [form, setForm] = useState({
    type: "supplement",
    catalogItemId: "",
    name: "",
    instructions: "",
    slots: ["morning"] as string[],
  })

  const choices = useMemo(
    () => catalog.filter((c) => c.type === form.type),
    [catalog, form.type],
  )

  // Picking from the library pre-fills its usual instructions and timing —
  // both still editable, because the same item is genuinely taken differently
  // by different people.
  const pickFromCatalog = (catalogItemId: string) => {
    const chosen = catalog.find((c) => c.id === catalogItemId)
    setForm((f) => ({
      ...f,
      catalogItemId,
      name: chosen?.name ?? "",
      instructions: chosen?.defaultInstructions ?? "",
      slots: chosen && chosen.defaultSlots.length > 0 ? chosen.defaultSlots : f.slots,
    }))
  }

  const load = useCallback(async () => {
    const to = toLocalDate(new Date())
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - (days - 1))
    const [adherence, plan, library] = await Promise.all([
      fetch(`/api/contacts/${id}/adherence?from=${toLocalDate(fromDate)}&to=${to}`).then((r) =>
        r.json(),
      ),
      fetch(`/api/contacts/${id}/care-plan`).then((r) => r.json()),
      fetch("/api/care-plan-catalog").then((r) => r.json()),
    ])
    setData(adherence?.calendar ? adherence : null)
    setItems(plan?.items ?? [])
    setCatalog(library?.items ?? [])
  }, [id, days])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const addItem = async () => {
    if (!form.name.trim() || form.slots.length === 0 || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/contacts/${id}/care-plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        setError(d?.error ?? "Could not add this item")
        toast.error(d?.error ?? "Could not add this item")
        return
      }
      toast.success("Care plan item added")
      setForm({ type: "supplement", catalogItemId: "", name: "", instructions: "", slots: ["morning"] })
      setShowAdd(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const stopItem = async (itemId: string, isActive: boolean) => {
    const res = await fetch(`/api/contacts/${id}/care-plan`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, isActive: !isActive }),
    })
    if (res.ok) toast.success(isActive ? "Item stopped" : "Item resumed")
    else {
      const d = await res.json().catch(() => null)
      toast.error(d?.error ?? "Couldn't save")
    }
    await load()
  }

  const logSlot = async (itemId: string, slot: string, status: string, date: string) => {
    const res = await fetch(`/api/contacts/${id}/adherence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ carePlanItemId: itemId, slot, status, loggedForDate: date }),
    })
    if (res.ok) toast.success("Adherence logged")
    else {
      const d = await res.json().catch(() => null)
      toast.error(d?.error ?? "Couldn't save")
    }
    await load()
  }

  // Pad the first week so day-of-week columns line up.
  const grid = useMemo(() => {
    if (!data) return []
    const lead = data.calendar.length > 0 ? weekdayIndex(data.calendar[0]!.date) : 0
    return [...Array<Day | null>(lead).fill(null), ...data.calendar]
  }, [data])

  const selectedDay = data?.calendar.find((d) => d.date === selected) ?? null

  if (loading || !data) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  const scored = data.calendar.filter((d) => d.rate !== null)

  return (
    <div className="space-y-4">

      <PageHeader
        title="Adherence"
        description="Every prescribed dose, and whether it was taken."
        actions={
        <div className="flex items-center gap-1.5">
          {[14, 30, 90].map((d) => (
            <Button
              key={d}
              onClick={() => setDays(d)} size="sm" variant={days === d ? "default" : "outline"}>
              {d} days
            </Button>
          ))}
        </div>
        }
      />

      {/* A single headline number does the job a chart would do badly here —
          "how are they doing overall" has one answer, not a shape. */}
      <div className="flex flex-wrap gap-6 rounded-md border border-border p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Adherence
          </p>
          <p className="mt-1 text-4xl font-medium">{pct(data.overall)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            across {scored.length} day{scored.length === 1 ? "" : "s"} with something due
          </p>
        </div>
        <div className="border-l border-border pl-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Active items
          </p>
          <p className="mt-1 text-4xl font-medium">{items.filter((i) => i.isActive).length}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {items.filter((i) => i.isActive).reduce((n, i) => n + i.slots.length, 0)} doses a day
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-md border border-border p-5">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Daily adherence
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Darker means more of that day&apos;s doses were taken. Click a day for the detail.
            </p>

            <div className="mb-1.5 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <span key={w} className="text-center text-[10px] font-medium text-muted-foreground">
                  {w}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {grid.map((day, i) =>
                day === null ? (
                  <div key={`pad-${i}`} />
                ) : (
                  <Button
                    key={day.date}
                    onClick={() => setSelected(day.date === selected ? null : day.date)}
                    title={`${day.date} — ${
                      day.expected === 0
                        ? "nothing due"
                        : `${day.completed} of ${day.expected} doses`
                    }`}
                    style={{ backgroundColor: rampColor(day.rate) }} size="sm" variant="outline" className="aspect-square">
                    {Number(day.date.slice(8))}
                  </Button>
                ),
              )}
            </div>

            {/* Legend: identity is never colour alone — every step is labelled. */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
              {[
                [ADHERENCE_RAMP.none, "Nothing due"],
                [ADHERENCE_RAMP.zero, "None taken"],
                [ADHERENCE_RAMP.low, "Under half"],
                [ADHERENCE_RAMP.mid, "Most"],
                [ADHERENCE_RAMP.high, "All"],
              ].map(([color, label]) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span
                    style={{ backgroundColor: color }}
                    className="h-3 w-3 rounded border border-border"
                  />
                  {label}
                </span>
              ))}
            </div>
          </section>

          {selectedDay && (
            <section className="rounded-md border border-border p-5">
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {new Date(`${selectedDay.date}T00:00:00`).toLocaleDateString([], {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}
              </h2>
              <p className="mb-4 text-xs text-muted-foreground">
                {selectedDay.expected === 0
                  ? "Nothing was prescribed for this day."
                  : `${selectedDay.completed} of ${selectedDay.expected} doses · ${pct(selectedDay.rate)}`}
              </p>

              {selectedDay.slots.length > 0 && (
                <ul className="space-y-1.5">
                  {selectedDay.slots.map((s) => (
                    <li
                      key={`${s.itemId}-${s.slot}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span>
                        {s.itemName}
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {CARE_PLAN_SLOTS.find((c) => c.value === s.slot)?.label ?? s.slot}
                        </span>
                      </span>
                      {/* Status is icon + word, never colour on its own. */}
                      <span className="flex items-center gap-1">
                        {[
                          { status: "done", label: "Taken", icon: Check },
                          { status: "partial", label: "Partly", icon: Minus },
                          { status: "missed", label: "Missed", icon: X },
                        ].map((opt) => (
                          <Button
                            key={opt.status}
                            onClick={() => logSlot(s.itemId, s.slot, opt.status, selectedDay.date)} size="sm" variant={s.status === opt.status ? "default" : "outline"}>
                            <opt.icon className="h-3 w-3" />
                            {opt.label}
                          </Button>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section className="rounded-md border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Care plan
              </h2>
              <Button
                onClick={() => setShowAdd((v) => !v)} size="sm" variant="ghost">
                <Plus className="h-3.5 w-3.5" />
                Assign
              </Button>
            </div>

            {showAdd && (
              <div className="mb-3 space-y-2 rounded-md border border-border p-3">
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value, catalogItemId: "", name: "" })
                  }
                  className={inputClass}
                >
                  {CARE_PLAN_ITEM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <select
                  value={form.catalogItemId}
                  onChange={(e) => pickFromCatalog(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Pick from library…</option>
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value, catalogItemId: "" })}
                  placeholder="or type something not in the library"
                  className={inputClass}
                />
                <input
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  placeholder="Instructions (optional)"
                  className={inputClass}
                />
                <div className="flex gap-1.5">
                  {CARE_PLAN_SLOTS.map((s) => {
                    const on = form.slots.includes(s.value)
                    return (
                      <Button
                        key={s.value}
                        onClick={() =>
                          setForm({
                            ...form,
                            slots: on
                              ? form.slots.filter((x) => x !== s.value)
                              : [...form.slots, s.value],
                          })
                        } size="sm" variant={on ? "default" : "outline"} className="flex-1">
                        {s.label}
                      </Button>
                    )
                  })}
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <Button
                  onClick={addItem}
                  disabled={!form.name.trim() || form.slots.length === 0 || saving} className="h-auto w-full justify-start whitespace-normal text-left w-full">
                  {saving ? <PredictSpinner className="size-4" /> : null}
                  Add to plan
                </Button>
              </div>
            )}

            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing assigned yet. Adherence can only be scored against a plan.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className={`rounded-md border px-3 py-2 ${
                      item.isActive ? "border-border" : "border-border bg-muted/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={item.isActive ? "" : "text-muted-foreground line-through"}>
                        {item.name}
                      </span>
                      <Button
                        onClick={() => stopItem(item.id, item.isActive)}
                        title={item.isActive ? "Stop this item" : "Restart this item"} variant="ghost">
                        {item.isActive ? <Ban className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {CARE_PLAN_ITEM_TYPES.find((t) => t.value === item.type)?.label ?? item.type} ·{" "}
                      {item.slots
                        .map((s) => CARE_PLAN_SLOTS.find((c) => c.value === s)?.label ?? s)
                        .join(", ")}
                    </p>
                    {item.instructions && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.instructions}</p>
                    )}
                    {item.assignedByName && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        by {item.assignedByName}
                        {item.assignedRole && ` · ${item.assignedRole.replace("_", " ")}`}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

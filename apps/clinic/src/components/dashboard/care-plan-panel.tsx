"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Ban, RotateCcw, Pill } from "lucide-react"
import { CARE_PLAN_ITEM_TYPES, CARE_PLAN_SLOTS } from "@workspace/db/care-plan"

interface CatalogItem {
  id: string
  type: string
  name: string
  defaultInstructions: string | null
  defaultSlots: string[]
}
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

const inputClass =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/30 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

/**
 * What this patient has been told to take or do, assigned by whoever has the
 * chart open — a doctor or a nutritionist here, a health coach in the
 * operations console.
 *
 * The list is the denominator for every adherence figure: each item's slots
 * are the doses due per day, and the patient's adherence page divides against
 * them. An item with no slots could never be scored, so one is required.
 */
export function CarePlanPanel({ userId }: { userId: string }) {
  const [items, setItems] = useState<PlanItem[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [contactId, setContactId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    type: "medication",
    catalogItemId: "",
    name: "",
    instructions: "",
    slots: ["morning"] as string[],
  })

  const choices = useMemo(() => catalog.filter((c) => c.type === form.type), [catalog, form.type])

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
    const res = await fetch(`/api/staff/care-plan?userId=${userId}`)
    const data = await res.json().catch(() => null)
    setItems(data?.items ?? [])
    setCatalog(data?.catalog ?? [])
    setContactId(data?.contactId ?? null)
  }, [userId])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const add = async () => {
    if (!form.name.trim() || form.slots.length === 0 || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/staff/care-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, ...form }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        setError(d?.error ?? "Could not add this item")
        return
      }
      setForm({ type: "medication", catalogItemId: "", name: "", instructions: "", slots: ["morning"] })
      setShowAdd(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (itemId: string, isActive: boolean) => {
    await fetch("/api/staff/care-plan", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, isActive: !isActive }),
    })
    await load()
  }

  return (
    <div className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
          <Pill className="h-3.5 w-3.5" />
          Care plan
        </div>
        {contactId && (
          <Button variant="ghost" size="sm" className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
 onClick={() => setShowAdd((v) => !v)}

 >
            <Plus className="h-3.5 w-3.5" />
            Assign
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <PredictSpinner className="size-5" />
        </div>
      ) : !contactId ? (
        <p className="text-sm text-black/65 dark:text-white/40">
          This account has no contact record yet, so nothing can be assigned to it.
        </p>
      ) : (
        <>
          {showAdd && (
            <div className="mb-3 space-y-2 rounded-md border border-black/18 p-3 dark:border-white/10">
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
                    <Button variant="ghost" size="sm"
                      key={s.value}
                      onClick={() =>
                        setForm({
                          ...form,
                          slots: on
                            ? form.slots.filter((x) => x !== s.value)
                            : [...form.slots, s.value],
                        })
                      }
                      className={`h-auto justify-start whitespace-normal text-left flex-1 border px-2 py-1.5 text-xs font-medium transition-colors ${
 on
 ?"border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
 :"border-black/18 text-black/60 hover:border-black/40 dark:border-white/10 dark:text-white/50"
 }`}
                    >
                      {s.label}
                    </Button>
                  )
                })}
              </div>
              <p className="text-[11px] text-black/65 dark:text-white/40">
                Times of day, not clock times — a dose taken late still counts.
              </p>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <Button variant="simple" size="default" className="w-full"
 onClick={add}
 disabled={!form.name.trim() || form.slots.length === 0 || saving}

 >
                {saving && <PredictSpinner className="size-4" />}
                Add to plan
              </Button>
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-sm text-black/65 dark:text-white/40">
              Nothing assigned yet. Adherence can only be measured against a plan.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    item.isActive
                      ? "border-black/18 dark:border-white/10"
                      : "border-black/12 bg-black/[0.02] dark:border-white/5 dark:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={
                        item.isActive ? "" : "text-black/65 line-through dark:text-white/40"
                      }
                    >
                      {item.name}
                    </span>
                    <Button variant="ghost" size="default" className="text-black/30 hover:text-black dark:text-white/30 dark:hover:text-white"
 onClick={() => toggle(item.id, item.isActive)}
 title={item.isActive ? "Stop this item" : "Restart this item"}

 >
                      {item.isActive ? (
                        <Ban className="h-3.5 w-3.5" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <p className="mt-0.5 text-xs text-black/65 dark:text-white/40">
                    {CARE_PLAN_ITEM_TYPES.find((t) => t.value === item.type)?.label ?? item.type} ·{" "}
                    {item.slots
                      .map((s) => CARE_PLAN_SLOTS.find((c) => c.value === s)?.label ?? s)
                      .join(", ")}
                  </p>
                  {item.instructions && (
                    <p className="mt-0.5 text-xs text-black/60 dark:text-white/50">
                      {item.instructions}
                    </p>
                  )}
                  {item.assignedByName && (
                    <p className="mt-0.5 text-[11px] text-black/60 dark:text-white/30">
                      by {item.assignedByName}
                      {item.assignedRole && ` · ${item.assignedRole.replace("_", " ")}`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

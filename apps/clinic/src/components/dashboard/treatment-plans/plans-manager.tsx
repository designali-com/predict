"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, RotateCcw, Ban, Pencil, Trash2, X } from "lucide-react"
import {
  COMMON_DURATIONS,
  formatPrice,
  limbsLabel,
  PLAN_LIMBS,
  planTotals,
} from "@workspace/db/treatment-plan"

interface PlanItem {
  id?: string
  kind: string
  name: string
  rateInPaise: number
  quantity: number
}

interface Plan {
  id: string
  name: string
  limbs: string
  durationDays: number
  sittings: number
  priceInPaise: number
  advancePercent: number
  description: string | null
  isActive: boolean
  sortOrder: number
  items: PlanItem[]
}

const inputClass =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/30 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

const cellClass =
  "w-full rounded-md border border-black/18 bg-white px-2 py-1.5 text-sm focus:border-black/30 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40"

/** A line as it is being edited — rupees, because that is how it is typed. */
interface DraftItem {
  kind: string
  name: string
  rateInRupees: string
  quantity: string
}

interface Draft {
  name: string
  limbs: string
  durationDays: string
  advancePercent: string
  description: string
  sortOrder: string
  items: DraftItem[]
}

// The five lines every package on the clinic's sheet has. A new plan starts as
// that shape rather than as an empty table, because the shape is the same every
// time and only the numbers change.
const STARTER_ITEMS: DraftItem[] = [
  { kind: "medicine", name: "", rateInRupees: "5580", quantity: "1" },
  { kind: "medicine", name: "Phyto Proflex", rateInRupees: "1620", quantity: "1" },
  { kind: "medicine", name: "Morn Blossom Sachet", rateInRupees: "99", quantity: "10" },
  { kind: "medicine", name: "Phyto Crystal", rateInRupees: "990", quantity: "1" },
  { kind: "treatment", name: "Treatment", rateInRupees: "1500", quantity: "6" },
]

const BLANK: Draft = {
  name: "",
  limbs: "two",
  durationDays: "21",
  advancePercent: "30",
  description: "",
  sortOrder: "0",
  items: STARTER_ITEMS.map((i) => ({ ...i })),
}

function toDraft(plan: Plan): Draft {
  return {
    name: plan.name,
    limbs: plan.limbs,
    durationDays: String(plan.durationDays),
    advancePercent: String(plan.advancePercent),
    description: plan.description ?? "",
    sortOrder: String(plan.sortOrder),
    items: plan.items.map((i) => ({
      kind: i.kind,
      name: i.name,
      rateInRupees: String(i.rateInPaise / 100),
      quantity: String(i.quantity),
    })),
  }
}

/** Draft rows are strings; totals need numbers. Blank reads as zero, not NaN. */
function measure(items: DraftItem[]) {
  return planTotals(
    items.map((i) => ({
      kind: i.kind,
      name: i.name,
      rateInPaise: Math.round((Number(i.rateInRupees) || 0) * 100),
      quantity: Number(i.quantity) || 0,
    })),
  )
}

/**
 * What the clinic sells, priced line by line.
 *
 * This mirrors the printed package sheet on purpose: a medicine combo, Phyto
 * Proflex, sachets, crystal, and Treatment — each with a rate and a quantity,
 * netting to the amount payable. Only the lines are entered. The net, the
 * quantity total and the sitting count are all computed from them and shown
 * live, so the screen can never quote a price its own lines do not support.
 *
 * The Treatment line is special: its quantity IS the number of sittings, which
 * is what the patient's log sheet lays out. That is why there can only be one.
 *
 * Retiring, not deleting, is how a plan is withdrawn — a retired plan leaves
 * the picker and keeps every course sold from it intact and countable.
 */
export function PlansManager() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState<string | "new" | null>(null)
  const [draft, setDraft] = useState<Draft>(BLANK)

  const load = useCallback(async () => {
    // Retired plans included: this is the screen that brings one back.
    const res = await fetch("/api/staff/treatment-plans?includeInactive=true")
    const data = await res.json().catch(() => null)
    setPlans(data?.plans ?? [])
  }, [])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const totals = useMemo(() => measure(draft.items), [draft.items])

  // Shown as money, not as a percentage of nothing. "30%" is not a number the
  // front desk can ask for; "₹25,727 before the course starts" is.
  const advanceHint = useMemo(() => {
    const pct = Number(draft.advancePercent) || 0
    if (pct <= 0) return "Nothing due before the course starts."
    // Rounded up, exactly as the server does — a hint that disagrees with the
    // amount actually demanded is worse than no hint.
    const due = formatPrice(Math.ceil((totals.netInPaise * pct) / 100))
    return `${due} before the course can start.`
  }, [draft.advancePercent, totals.netInPaise])

  const startNew = () => {
    setDraft({ ...BLANK, items: STARTER_ITEMS.map((i) => ({ ...i })) })
    setEditing("new")
    setError(null)
  }

  const startEdit = (plan: Plan) => {
    setDraft(toDraft(plan))
    setEditing(plan.id)
    setError(null)
  }

  const setItem = (index: number, patch: Partial<DraftItem>) => {
    setDraft((d) => ({
      ...d,
      items: d.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }))
  }

  const addItem = () => {
    setDraft((d) => ({
      ...d,
      items: [...d.items, { kind: "medicine", name: "", rateInRupees: "", quantity: "1" }],
    }))
  }

  const removeItem = (index: number) => {
    setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }))
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy("save")
    setError(null)
    try {
      const isNew = editing === "new"
      const res = await fetch(
        isNew ? "/api/staff/treatment-plans" : `/api/staff/treatment-plans/${editing}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        },
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not save the plan")
        return
      }
      setEditing(null)
      await load()
    } finally {
      setBusy(null)
    }
  }

  const setActive = async (plan: Plan, isActive: boolean) => {
    setBusy(plan.id)
    setError(null)
    try {
      const res = await fetch(`/api/staff/treatment-plans/${plan.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? "Could not update the plan")
        return
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  const remove = async (plan: Plan) => {
    setBusy(plan.id)
    setError(null)
    try {
      const res = await fetch(`/api/staff/treatment-plans/${plan.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        // The refusal explains itself — it names how many patients are on the
        // plan and says to retire it instead.
        setError(data?.error ?? "Could not delete the plan")
        return
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center rounded-md border border-black/18 py-12 dark:border-white/10">
        <PredictSpinner />
      </div>
    )
  }

  const active = plans.filter((p) => p.isActive)
  const retired = plans.filter((p) => !p.isActive)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Treatment Plans</h1>
        </div>
        {editing === null && (
          <Button variant="simple" size="lg" className="active:scale-95"
 onClick={startNew}

 >
            <Plus className="h-4 w-4" />
            New plan
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {editing !== null && (
        <form
          onSubmit={save}
          className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {editing === "new" ? "New plan" : "Edit plan"}
            </h2>
            <Button variant="ghost" size="default" className="text-black/65 hover:text-black dark:text-white/40 dark:hover:text-white"
 type="button"
 onClick={() => setEditing(null)}

 aria-label="Close"
 >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="sm:col-span-2">
              <span className={labelClass}>Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Four Limbs 21 Day"
                className={inputClass}
              />
            </label>

            <label>
              <span className={labelClass}>Package</span>
              <select
                value={draft.limbs}
                onChange={(e) => setDraft({ ...draft, limbs: e.target.value })}
                className={inputClass}
              >
                {PLAN_LIMBS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label} — {l.caption}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>Duration (days)</span>
              <input
                type="number"
                min={1}
                max={365}
                list="common-durations"
                value={draft.durationDays}
                onChange={(e) => setDraft({ ...draft, durationDays: e.target.value })}
                className={inputClass}
              />
              {/* The three the clinic sells today, offered but not enforced —
                  a new package should not need a code change. */}
              <datalist id="common-durations">
                {COMMON_DURATIONS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>

            <label className="sm:col-span-2 lg:col-span-3">
              <span className={labelClass}>Description</span>
              <input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What this course covers"
                className={inputClass}
              />
            </label>

            <label>
              <span className={labelClass}>Advance (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={draft.advancePercent}
                onChange={(e) => setDraft({ ...draft, advancePercent: e.target.value })}
                className={inputClass}
              />
              <span className="mt-1 block text-[11px] text-black/65 dark:text-white/40">
                {advanceHint}
              </span>
            </label>

            <label>
              <span className={labelClass}>Order</span>
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className={labelClass}>Medicine and treatment</span>
              <Button variant="ghost" size="sm" className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
 type="button"
 onClick={addItem}

 >
                <Plus className="h-3.5 w-3.5" />
                Add line
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border border-black/18 dark:border-white/10">
              <table className="w-full text-sm">
                <thead className="border-b border-black/18 bg-black/[0.02] text-left text-xs text-black/65 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/45">
                  <tr>
                    <th className="px-2 py-2 font-medium">Item</th>
                    <th className="w-28 px-2 py-2 font-medium">Kind</th>
                    <th className="w-28 px-2 py-2 font-medium">Rate (₹)</th>
                    <th className="w-20 px-2 py-2 font-medium">Qty.</th>
                    <th className="w-32 px-2 py-2 text-right font-medium">Amount (₹)</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {draft.items.map((item, index) => {
                    const amount =
                      Math.round((Number(item.rateInRupees) || 0) * 100) * (Number(item.quantity) || 0)
                    return (
                      <tr key={index} className="border-b border-black/12 last:border-0 dark:border-white/5">
                        <td className="px-2 py-1.5">
                          <input
                            value={item.name}
                            onChange={(e) => setItem(index, { name: e.target.value })}
                            placeholder="(2 BHT + LL + NPF-1) Combo"
                            className={cellClass}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={item.kind}
                            onChange={(e) => setItem(index, { kind: e.target.value })}
                            className={cellClass}
                          >
                            <option value="medicine">Medicine</option>
                            <option value="treatment">Treatment</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            value={item.rateInRupees}
                            onChange={(e) => setItem(index, { rateInRupees: e.target.value })}
                            className={cellClass}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => setItem(index, { quantity: e.target.value })}
                            className={cellClass}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {formatPrice(amount)}
                        </td>
                        <td className="px-2 py-1.5">
                          <Button variant="ghost" size="default" className="text-black/65 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
 type="button"
 onClick={() => removeItem(index)}
 aria-label={`Remove line ${index + 1}`}

 >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {/* Computed live from the rows above, never typed in — the same
                    three totals the printed sheet carries along its bottom. */}
                <tfoot className="border-t border-black/18 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.05]">
                  <tr className="font-semibold">
                    <td className="px-2 py-2">Net amount payable</td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 tabular-nums">{formatPrice(totals.rateSumInPaise)}</td>
                    <td className="px-2 py-2 tabular-nums">{totals.quantity}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatPrice(totals.netInPaise)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="mt-2 text-[11px] text-black/60 dark:text-white/40">
              The Treatment line&apos;s quantity is how many sittings the patient gets —{" "}
              <strong>
                {totals.sittings || "none"} sitting{totals.sittings === 1 ? "" : "s"}
              </strong>{" "}
              on this plan. Exactly one Treatment line, and it cannot exceed the duration.
            </p>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button variant="simple" size="default"
 type="submit"
 disabled={busy === "save"}

 >
              {busy === "save" && <PredictSpinner className="size-4" />}
              Save plan
            </Button>
            <Button variant="outline" size="default"
 type="button"
 onClick={() => setEditing(null)}

 >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <PlanTable
        plans={active}
        busy={busy}
        onEdit={startEdit}
        onRetire={(p) => setActive(p, false)}
        onRestore={(p) => setActive(p, true)}
        onDelete={remove}
      />

      {retired.length > 0 && (
        <div>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
            Retired
          </h2>
          <PlanTable
            plans={retired}
            busy={busy}
            onEdit={startEdit}
            onRetire={(p) => setActive(p, false)}
            onRestore={(p) => setActive(p, true)}
            onDelete={remove}
          />
        </div>
      )}
    </div>
  )
}

function PlanTable({
  plans,
  busy,
  onEdit,
  onRetire,
  onRestore,
  onDelete,
}: {
  plans: Plan[]
  busy: string | null
  onEdit: (p: Plan) => void
  onRetire: (p: Plan) => void
  onRestore: (p: Plan) => void
  onDelete: (p: Plan) => void
}) {
  if (plans.length === 0) {
    return (
      <p className="rounded-md border border-black/18 p-6 text-center text-sm text-black/65 dark:border-white/10 dark:text-white/40">
        No plans here. Create one to start enrolling patients.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className={`rounded-md border border-black/18 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-black ${
            plan.isActive ? "" : "opacity-60"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{plan.name}</p>
              <p className="text-xs text-black/60 dark:text-white/40">
                {limbsLabel(plan.limbs)} · {plan.durationDays} days · {plan.sittings} sittings
                {plan.advancePercent > 0 && ` · ${plan.advancePercent}% advance`}
                {plan.description ? ` · ${plan.description}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {formatPrice(plan.priceInPaise)}
              </span>
              {busy === plan.id && <PredictSpinner className="size-4" />}
              <IconButton label="Edit" onClick={() => onEdit(plan)}>
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
              {plan.isActive ? (
                <IconButton label="Retire" onClick={() => onRetire(plan)}>
                  <Ban className="h-3.5 w-3.5" />
                </IconButton>
              ) : (
                <>
                  <IconButton label="Restore" onClick={() => onRestore(plan)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </IconButton>
                  {/* Only on a retired plan, and the server still refuses it
                      once anyone has been sold one. */}
                  <IconButton label="Delete" onClick={() => onDelete(plan)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </>
              )}
            </div>
          </div>

          {plan.items.length > 0 && (
            <div className="mt-2 overflow-x-auto rounded-md border border-black/12 dark:border-white/5">
              <table className="w-full text-sm">
                <tbody>
                  {plan.items.map((item) => (
                    <tr
                      key={item.id ?? item.name}
                      className="border-b border-black/12 last:border-0 dark:border-white/5"
                    >
                      <td className="px-2.5 py-1.5">
                        {item.name}
                        {item.kind === "treatment" && (
                          <span className="ml-1.5 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/60 dark:bg-white/10 dark:text-white/50">
                            sittings
                          </span>
                        )}
                      </td>
                      <td className="w-24 px-2.5 py-1.5 text-right tabular-nums text-black/65 dark:text-white/45">
                        {formatPrice(item.rateInPaise)}
                      </td>
                      <td className="w-16 px-2.5 py-1.5 text-right tabular-nums text-black/65 dark:text-white/45">
                        × {item.quantity}
                      </td>
                      <td className="w-28 px-2.5 py-1.5 text-right font-medium tabular-nums">
                        {formatPrice(item.rateInPaise * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button variant="ghost" size="default" className="text-black/60 hover:bg-black/5 hover:text-black dark:text-white/45 dark:hover:bg-white/5 dark:hover:text-white"
 onClick={onClick}
 title={label}
 aria-label={label}

 >
      {children}
    </Button>
  )
}

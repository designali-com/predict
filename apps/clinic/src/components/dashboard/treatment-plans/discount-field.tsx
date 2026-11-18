"use client"

import { useState } from "react"
import { BadgePercent, Pencil } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { formatPrice } from "@workspace/db/treatment-plan"

export interface DiscountValue {
  mode: "amount" | "percent"
  /** As typed: rupees, or a percentage. */
  value: string
  reason: string
}

export const noDiscount = (): DiscountValue => ({ mode: "amount", value: "", reason: "" })

/** What a typed discount comes to on this package, and whether it is allowed. */
export function discountPreview(grossInPaise: number, d: DiscountValue) {
  const n = Number(d.value)
  if (!d.value.trim() || !Number.isFinite(n) || n <= 0) return { offInPaise: 0, netInPaise: grossInPaise, error: null as string | null }
  const offInPaise = d.mode === "percent" ? Math.round((grossInPaise * n) / 100) : Math.round(n * 100)
  const error =
    d.mode === "percent" && n > 100
      ? "A discount cannot be more than 100%."
      : offInPaise > grossInPaise
        ? "The discount is more than the package costs."
        : null
  return { offInPaise, netInPaise: Math.max(0, grossInPaise - offInPaise), error }
}

/** The body the API takes, or null for no discount. */
export function discountBody(d: DiscountValue) {
  const n = Number(d.value)
  if (!d.value.trim() || !Number.isFinite(n) || n <= 0) return null
  return { mode: d.mode, value: n, reason: d.reason.trim() || null }
}

const input =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/30 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

/**
 * A discount, as the doctor or the desk gives it: rupees off, or a percentage
 * of the package — with what the patient will pay worked out as it is typed.
 */
export function DiscountField({
  grossInPaise,
  value,
  onChange,
}: {
  /** The package before any discount. */
  grossInPaise: number
  value: DiscountValue
  onChange: (next: DiscountValue) => void
}) {
  const preview = discountPreview(grossInPaise, value)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="flex shrink-0 overflow-hidden rounded-md border border-black/18 text-sm dark:border-white/10">
          {(["amount", "percent"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...value, mode: m })}
              className={`px-3 py-2 font-medium ${
                value.mode === m ? "bg-primary text-primary-foreground" : "text-black/60 hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/5"
              }`}
            >
              {m === "amount" ? "₹" : "%"}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={0}
          step={value.mode === "percent" ? "0.5" : "1"}
          value={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
          placeholder={value.mode === "percent" ? "e.g. 10" : "e.g. 12455"}
          className={input}
        />
      </div>
      <input
        value={value.reason}
        onChange={(e) => onChange({ ...value, reason: e.target.value })}
        placeholder="Why (optional) — e.g. senior citizen, referral"
        className={input}
      />
      <p className={`text-xs ${preview.error ? "text-red-600" : "text-black/60 dark:text-white/45"}`}>
        {preview.error ??
          (preview.offInPaise > 0
            ? `${formatPrice(preview.offInPaise)} off ${formatPrice(grossInPaise)} — patient pays ${formatPrice(preview.netInPaise)}`
            : `No discount — patient pays ${formatPrice(grossInPaise)}`)}
      </p>
    </div>
  )
}

/**
 * The discount on a running course: what it is, and — for the doctor and the
 * desk — a way to change or remove it. Everything that reads the bill follows.
 */
export function DiscountEditor({
  enrollmentId,
  grossInPaise,
  discountInPaise,
  discountPercent,
  discountReason,
  canEdit,
  onSaved,
}: {
  enrollmentId: string
  grossInPaise: number
  discountInPaise: number
  discountPercent: number | null
  discountReason: string | null
  canEdit: boolean
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<DiscountValue>(noDiscount())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = () => {
    setValue(
      discountInPaise > 0
        ? discountPercent
          ? { mode: "percent", value: String(discountPercent), reason: discountReason ?? "" }
          : { mode: "amount", value: String(discountInPaise / 100), reason: discountReason ?? "" }
        : noDiscount(),
    )
    setError(null)
    setEditing(true)
  }

  const save = async (body: ReturnType<typeof discountBody>) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/staff/enrollments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrollmentId, discount: body }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) return setError(data?.error ?? "Could not change the discount")
      setEditing(false)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    if (!canEdit && discountInPaise === 0) return null
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-black/65 dark:text-white/50">
          <BadgePercent className="size-3.5 text-primary" />
          {discountInPaise > 0 ? (
            <>
              Discount <b className="text-black dark:text-white">{formatPrice(discountInPaise)}</b>
              {discountPercent ? ` (${discountPercent}%)` : ""}
              {discountReason ? ` · ${discountReason}` : ""}
            </>
          ) : (
            "No discount on this package"
          )}
        </span>
        {canEdit && (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={open}>
            <Pencil className="size-3" /> {discountInPaise > 0 ? "Change" : "Add discount"}
          </Button>
        )}
      </div>
    )
  }

  const preview = discountPreview(grossInPaise, value)
  return (
    <div className="rounded-md border border-black/18 p-3 dark:border-white/10">
      <p className="mb-2 text-xs font-semibold">Discount on this package</p>
      <DiscountField grossInPaise={grossInPaise} value={value} onChange={setValue} />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {discountInPaise > 0 && (
          <Button type="button" size="sm" variant="ghost" className="mr-auto text-red-600" disabled={busy} onClick={() => save(null)}>
            Remove discount
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={busy || !!preview.error} onClick={() => save(discountBody(value))}>
          {busy ? "Saving…" : "Save discount"}
        </Button>
      </div>
    </div>
  )
}

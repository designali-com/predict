"use client"
import { Button } from "@workspace/ui/components/button"

import { Plus, X } from "lucide-react"
import { formatPrice } from "@workspace/db/treatment-plan"
import { PredictSpinner } from "@/src/components/predict-loader"

export interface BillItem {
  id: string
  kind: string
  name: string
  rateInPaise: number
  quantity: number
  isExtra: boolean
}

export interface Billing {
  /** The package lines added up, before the discount. */
  grossInPaise?: number
  discountInPaise?: number
  discountPercent?: number | null
  /** After the discount. */
  packageInPaise: number
  extrasInPaise: number
  totalInPaise: number
}

export interface ExtraDraft {
  name: string
  rateInRupees: string
  quantity: string
}

const fieldClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:border-ring focus:outline-none"

const labelClass = "mb-1 block text-xs font-medium text-muted-foreground"

/**
 * What this course cost, line by line, as it stood on the day it was sold.
 *
 * Read from the enrolment's own snapshot and never from the catalogue:
 * repricing a plan next month must not change the bill of somebody already on
 * it, or what they were handed.
 *
 * Extras sit under the package and total separately. "If your body requires
 * extra medicine then you have to buy extra flat cost" is a second
 * transaction — rolling it into the package would make the course look like it
 * cost more than it was sold for, and the package price is the number a
 * patient quotes back over the phone.
 */
export function Bill({
  items,
  billing,
  busy,
  open,
  extra,
  onExtraChange,
  onToggle,
  onAdd,
  onDrop,
}: {
  items: BillItem[]
  billing: Billing
  busy: string | null
  open: boolean
  extra: ExtraDraft
  onExtraChange: (v: ExtraDraft) => void
  onToggle: () => void
  onAdd: (e: React.FormEvent) => void
  onDrop: (itemId: string) => void
}) {
  // A course enrolled before plans carried line items has nothing to show, and
  // an empty table reads as "this cost nothing".
  if (items.length === 0) return null

  const packageItems = items.filter((i) => !i.isExtra)
  const extras = items.filter((i) => i.isExtra)

  return (
    <div className="mt-3 rounded-md border border-border">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Bill
        </span>
        <Button
          onClick={onToggle} size="sm" variant="ghost">
          <Plus className="h-3 w-3" />
          Extra medicine
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {packageItems.map((item) => (
              <Line key={item.id} item={item} />
            ))}
            {(billing.discountInPaise ?? 0) > 0 && (
              <>
                <tr className="border-t border-border">
                  <td className="px-2.5 py-1.5">Package total</td>
                  <td colSpan={2} />
                  <td className="px-2.5 py-1.5 text-right tabular-nums">
                    {formatPrice(billing.grossInPaise ?? billing.packageInPaise + (billing.discountInPaise ?? 0))}
                  </td>
                  <td />
                </tr>
                <tr className="text-emerald-700 dark:text-emerald-400">
                  <td className="px-2.5 py-1.5">
                    Discount{billing.discountPercent ? ` (${billing.discountPercent}%)` : ""}
                  </td>
                  <td colSpan={2} />
                  <td className="px-2.5 py-1.5 text-right tabular-nums">− {formatPrice(billing.discountInPaise!)}</td>
                  <td />
                </tr>
              </>
            )}
            <tr className="border-t border-border font-medium">
              <td className="px-2.5 py-1.5">{(billing.discountInPaise ?? 0) > 0 ? "Package after discount" : "Package"}</td>
              <td colSpan={2} />
              <td className="px-2.5 py-1.5 text-right tabular-nums">
                {formatPrice(billing.packageInPaise)}
              </td>
              <td />
            </tr>

            {extras.length > 0 && (
              <>
                {extras.map((item) => (
                  <Line
                    key={item.id}
                    item={item}
                    busy={busy === item.id}
                    onDrop={() => onDrop(item.id)}
                  />
                ))}
                <tr className="border-t border-border font-medium">
                  <td className="px-2.5 py-1.5">Extras</td>
                  <td colSpan={2} />
                  <td className="px-2.5 py-1.5 text-right tabular-nums">
                    {formatPrice(billing.extrasInPaise)}
                  </td>
                  <td />
                </tr>
                <tr className="border-t border-border bg-muted font-semibold">
                  <td className="px-2.5 py-2">Total</td>
                  <td colSpan={2} />
                  <td className="px-2.5 py-2 text-right tabular-nums">
                    {formatPrice(billing.totalInPaise)}
                  </td>
                  <td />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <form
          onSubmit={onAdd}
          className="flex flex-wrap items-end gap-2 border-t border-border p-2.5"
        >
          <label className="min-w-[180px] flex-1">
            <span className={labelClass}>Medicine</span>
            <input
              value={extra.name}
              onChange={(e) => onExtraChange({ ...extra, name: e.target.value })}
              placeholder="Phyto Proflex"
              className={fieldClass}
              required
            />
          </label>
          <label className="w-28">
            <span className={labelClass}>Rate (₹)</span>
            <input
              type="number"
              min={0}
              value={extra.rateInRupees}
              onChange={(e) => onExtraChange({ ...extra, rateInRupees: e.target.value })}
              className={fieldClass}
              required
            />
          </label>
          <label className="w-20">
            <span className={labelClass}>Qty.</span>
            <input
              type="number"
              min={1}
              value={extra.quantity}
              onChange={(e) => onExtraChange({ ...extra, quantity: e.target.value })}
              className={fieldClass}
              required
            />
          </label>
          <Button
            type="submit"
            disabled={busy === "extra"}>
            {busy === "extra" && <PredictSpinner className="size-4" />}
            Add
          </Button>
        </form>
      )}
    </div>
  )
}

function Line({
  item,
  busy,
  onDrop,
}: {
  item: BillItem
  busy?: boolean
  onDrop?: () => void
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-2.5 py-1.5">
        {item.name}
        {/* The treatment line is the one that is not dispensed — its quantity
            is the sittings the log sheet below lays out. */}
        {item.kind === "treatment" && (
          <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            sittings
          </span>
        )}
        {item.isExtra && (
          <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
            extra
          </span>
        )}
      </td>
      <td className="w-24 px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">
        {formatPrice(item.rateInPaise)}
      </td>
      <td className="w-14 px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">
        × {item.quantity}
      </td>
      <td className="w-28 px-2.5 py-1.5 text-right tabular-nums">
        {formatPrice(item.rateInPaise * item.quantity)}
      </td>
      <td className="w-8 px-1 py-1.5">
        {/* Only extras can be removed — the package lines are the agreement. */}
        {onDrop && (
          <Button
            onClick={onDrop}
            disabled={busy}
            aria-label={`Remove ${item.name}`} variant="ghost">
            <X className="h-3 w-3" />
          </Button>
        )}
      </td>
    </tr>
  )
}

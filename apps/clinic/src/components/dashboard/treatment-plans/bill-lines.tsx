"use client"

import { formatPrice } from "@workspace/db/treatment-plan"

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
  /** The package after its discount — what the patient pays for it. */
  packageInPaise: number
  extrasInPaise: number
  totalInPaise: number
}

/**
 * What this course cost, as it was on the day it was sold.
 *
 * Read-only here. The clinic panel is where the chart is worked; dispensing
 * extra medicine happens at the counter, so the form for it lives in the
 * operations console rather than being offered in two places that could
 * disagree about who added what.
 */
export function BillLines({ items, billing }: { items: BillItem[]; billing: Billing }) {
  // A course enrolled before plans carried line items has nothing to show, and
  // an empty table would read as "this cost nothing".
  if (items.length === 0) return null

  const packageItems = items.filter((i) => !i.isExtra)
  const extras = items.filter((i) => i.isExtra)
  const discount = billing.discountInPaise ?? 0

  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-black/18 dark:border-white/10">
      <table className="w-full text-sm">
        <tbody>
          {packageItems.map((item) => (
            <Line key={item.id} item={item} />
          ))}
          {discount > 0 ? (
            <>
              <Total label="Package" value={billing.grossInPaise ?? billing.packageInPaise + discount} />
              <tr className="text-emerald-700 dark:text-emerald-400">
                <td className="px-2.5 py-1.5">
                  Discount{billing.discountPercent ? ` (${billing.discountPercent}%)` : ""}
                </td>
                <td colSpan={2} />
                <td className="px-2.5 py-1.5 text-right tabular-nums">− {formatPrice(discount)}</td>
              </tr>
              <Total label="Package after discount" value={billing.packageInPaise} strong={extras.length === 0} />
            </>
          ) : (
            <Total label="Package" value={billing.packageInPaise} />
          )}

          {extras.length > 0 && (
            <>
              {extras.map((item) => (
                <Line key={item.id} item={item} />
              ))}
              <tr className="border-t border-black/18 font-medium dark:border-white/10">
                <td className="px-2.5 py-1.5">Extras</td>
                <td colSpan={2} />
                <td className="px-2.5 py-1.5 text-right tabular-nums">
                  {formatPrice(billing.extrasInPaise)}
                </td>
              </tr>
              <tr className="border-t border-black/18 bg-black/[0.03] font-semibold dark:border-white/10 dark:bg-white/[0.05]">
                <td className="px-2.5 py-2">Total</td>
                <td colSpan={2} />
                <td className="px-2.5 py-2 text-right tabular-nums">
                  {formatPrice(billing.totalInPaise)}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr
      className={`border-t border-black/18 dark:border-white/10 ${
        strong ? "bg-black/[0.03] font-semibold dark:bg-white/[0.05]" : "font-medium"
      }`}
    >
      <td className="px-2.5 py-1.5">{label}</td>
      <td colSpan={2} />
      <td className="px-2.5 py-1.5 text-right tabular-nums">{formatPrice(value)}</td>
    </tr>
  )
}

function Line({ item }: { item: BillItem }) {
  return (
    <tr className="border-b border-black/12 last:border-0 dark:border-white/5">
      <td className="px-2.5 py-1.5">
        {item.name}
        {/* The one line that is not dispensed — its quantity is the sittings. */}
        {item.kind === "treatment" && (
          <span className="ml-1.5 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/60 dark:bg-white/10 dark:text-white/50">
            sittings
          </span>
        )}
        {item.isExtra && (
          <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
            extra
          </span>
        )}
      </td>
      <td className="w-24 px-2.5 py-1.5 text-right tabular-nums text-black/65 dark:text-white/45">
        {formatPrice(item.rateInPaise)}
      </td>
      <td className="w-14 px-2.5 py-1.5 text-right tabular-nums text-black/65 dark:text-white/45">
        × {item.quantity}
      </td>
      <td className="w-28 px-2.5 py-1.5 text-right tabular-nums">
        {formatPrice(item.rateInPaise * item.quantity)}
      </td>
    </tr>
  )
}

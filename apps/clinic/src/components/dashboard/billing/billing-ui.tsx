"use client"

/* The Billing page's shared pieces — Payments, Expenses and the profit panel
   all draw their cards, money and breakdowns the same way. */

export const CARD = "rounded-md border border-black/18 bg-white dark:border-white/10 dark:bg-black"
export const MUTED = "text-black/60 dark:text-white/40"
export const CONTROL =
  "h-8 rounded-md border border-black/18 bg-white px-2.5 text-sm dark:border-white/10 dark:bg-black dark:text-white"

/** India today, offset by n days. */
export function day(offset = 0): string {
  return new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10)
}

export function monthStart(): string {
  return day(0).slice(0, 8) + "01"
}

/** Whole rupees for cards and charts; tables keep formatPrice. */
export function money(paise: number): string {
  const sign = paise < 0 ? "−" : ""
  return sign + "₹" + Math.round(Math.abs(paise) / 100).toLocaleString("en-IN")
}

export function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return date
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })
}

export const PRESETS = [
  { key: "today", label: "Today", range: () => ({ from: day(0), to: day(0) }) },
  { key: "yesterday", label: "Yesterday", range: () => ({ from: day(-1), to: day(-1) }) },
  { key: "7", label: "7 days", range: () => ({ from: day(-6), to: day(0) }) },
  { key: "month", label: "This month", range: () => ({ from: monthStart(), to: day(0) }) },
  { key: "30", label: "30 days", range: () => ({ from: day(-29), to: day(0) }) },
]

export function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: "warn" | "good" | "bad"
}) {
  return (
    <div className={`${CARD} p-3.5`}>
      <p className={`text-[11px] font-semibold tracking-widest uppercase ${MUTED}`}>{label}</p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          tone === "warn"
            ? "text-amber-700 dark:text-amber-400"
            : tone === "good"
              ? "text-emerald-700 dark:text-emerald-400"
              : tone === "bad"
                ? "text-red-700 dark:text-red-400"
                : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className={`mt-0.5 text-[11px] ${MUTED}`}>{hint}</p>}
    </div>
  )
}

export interface Split {
  key: string
  amountInPaise: number
  count: number
}

/** A breakdown with a bar per row, so the share reads without doing the sum. */
export function Shares({
  title,
  rows,
  labels,
  total,
  unit = "payment",
}: {
  title: string
  rows: Split[]
  labels: Map<string, string>
  total: number
  unit?: string
}) {
  return (
    <div className={`${CARD} p-4`}>
      <h3 className="mb-2.5 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className={`text-xs ${MUTED}`}>Nothing in this period.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const pct = total > 0 ? Math.round((r.amountInPaise / total) * 100) : 0
            return (
              <li key={r.key} title={`${r.count} ${unit}${r.count === 1 ? "" : "s"}`}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{labels.get(r.key) ?? r.key}</span>
                  <span className="shrink-0 tabular-nums">
                    {money(r.amountInPaise)} <span className={`text-[11px] ${MUTED}`}>{pct}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

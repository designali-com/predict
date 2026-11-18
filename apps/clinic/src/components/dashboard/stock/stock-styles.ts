/** Shared between the shelf, the history and the reports so the three tabs of
 *  one page cannot drift apart. */

export const INPUT =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

export const LABEL =
  "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40"

/** Trims the float noise a measured quantity picks up, without lying about .5 */
export function qty(n: number): string {
  return Number(n.toFixed(3)).toLocaleString("en-IN")
}

/**
 * Paise to rupees.
 *
 * Whole rupees only: the storeroom deals in hundreds of thousands and the paise
 * on a valuation are noise that makes the number harder to read, not more true.
 */
export function rupees(paise: number): string {
  return "₹" + Math.round(paise / 100).toLocaleString("en-IN")
}

/** A clinic date (YYYY-MM-DD) as a short readable day. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return date
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  })
}

/** Today and N days back, as clinic dates, for the period presets. */
export function daysAgo(n: number): string {
  const d = new Date()
  // +05:30, so "today" flips at midnight in the clinic rather than in UTC.
  d.setUTCMinutes(d.getUTCMinutes() + 330 - n * 24 * 60)
  return d.toISOString().slice(0, 10)
}

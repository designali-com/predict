/**
 * The window a dashboard card is reporting on.
 *
 * Two numbers come out of a period, and they are not the same thing: the
 * headline counts what happened inside it, and the trend shows a run of
 * comparable buckets around it. Asking for "today" and being shown a bar per
 * week would answer a question nobody asked, so the bucket follows the period.
 */
export const PERIODS = [
  { value: "day", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
] as const

export type Period = (typeof PERIODS)[number]["value"]

export function resolvePeriod(value: unknown): Period {
  return PERIODS.some((p) => p.value === value) ? (value as Period) : "day"
}

export function periodLabel(period: Period): string {
  return PERIODS.find((p) => p.value === period)?.label ?? "Today"
}

/** Start of the window the headline counts. Null for all time. */
export function periodStart(period: Period): Date | null {
  const now = new Date()

  switch (period) {
    case "day": {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case "week": {
      const d = new Date(now)
      // Monday, not Sunday — a clinic week starts when the clinic opens, and
      // Postgres' date_trunc('week') agrees, so the headline and the bars
      // cannot disagree about which week today is in.
      const weekday = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - weekday)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case "month": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1)
      return d
    }
    case "year": {
      return new Date(now.getFullYear(), 0, 1)
    }
    default:
      return null
  }
}

/**
 * The bucket size for the trend, and how far back it runs.
 *
 * `unit` is interpolated into date_trunc, so it stays a literal from this
 * closed set and never comes from a request.
 */
export function trendSpec(period: Period): {
  unit: "day" | "week" | "month" | "year"
  since: Date | null
  format: string
} {
  const now = new Date()
  const back = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  switch (period) {
    case "day":
      return { unit: "day", since: back(13), format: "DD Mon" }
    case "week":
      return { unit: "week", since: back(7 * 11), format: "DD Mon" }
    case "month":
      return { unit: "month", since: new Date(now.getFullYear() - 1, now.getMonth(), 1), format: "Mon" }
    case "year":
      return { unit: "year", since: new Date(now.getFullYear() - 4, 0, 1), format: "YYYY" }
    default:
      // All time buckets by month, which reads as history without becoming a
      // bar per day for a clinic that has been open two years.
      return { unit: "month", since: null, format: "Mon YY" }
  }
}

import Link from "next/link"

/**
 * A single figure with the thing it is a share of underneath it.
 *
 * A rate on its own is unreadable at small volumes — 100% of two is not the
 * same claim as 100% of two hundred — so the denominator travels with it.
 */
export function Metric({
  label,
  value,
  of,
  tone,
}: {
  label: string
  value: string | number
  of?: string
  tone?: "good" | "bad"
}) {
  return (
    <div className="rounded-xl border border-black/18 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-black">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
        {label}
      </p>
      <div
        className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${
          tone === "bad" ? "text-red-600 dark:text-red-400" : ""
        }`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {of && <p className="mt-1 text-xs text-black/60 dark:text-white/40">{of}</p>}
    </div>
  )
}

/**
 * A composition, as labelled shares.
 *
 * Not a pie: comparing angles is harder than comparing bar lengths, and a
 * report is read for the numbers rather than the shape. The count and the
 * percentage both appear because a report gets exported into an email where
 * only one of them survives.
 */
export function ShareTable({
  rows,
  total,
  empty = "Nothing yet.",
}: {
  rows: { label: string; value: number; hint?: string }[]
  total: number
  empty?: string
}) {
  if (!rows.length || total === 0) {
    return (
      <p className="flex flex-1 items-center justify-center py-8 text-sm text-black/65 dark:text-white/40">
        {empty}
      </p>
    )
  }

  const share = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate" title={row.label}>
            {row.label}
            {row.hint && (
              <span className="block text-[11px] text-black/65 dark:text-white/35">{row.hint}</span>
            )}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-primary/60"
              style={{ width: `${share(row.value)}%` }}
            />
          </div>
          <span className="w-24 shrink-0 text-right tabular-nums text-black/60 dark:text-white/55">
            {row.value.toLocaleString()}
            <span className="ml-1.5 text-xs text-black/65 dark:text-white/35">
              {share(row.value)}%
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * A funnel step and how much of the step above it survived.
 *
 * The drop between two stages is the number people act on, so it is written
 * out rather than left to be worked out from two totals.
 */
export function FunnelSteps({ steps }: { steps: { label: string; value: number }[] }) {
  const top = steps[0]?.value ?? 0

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const previous = steps[i - 1]
        const width = top > 0 ? Math.max((step.value / top) * 100, 1) : 1
        const kept = previous && previous.value > 0 ? Math.round((step.value / previous.value) * 100) : null
        return (
          <div key={step.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{step.label}</span>
              <span className="tabular-nums">
                {step.value.toLocaleString()}
                {kept !== null && (
                  <span className="ml-2 text-xs text-black/60 dark:text-white/40">
                    {kept}% of {previous!.label.toLowerCase()}
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${width}%`, opacity: 1 - i * 0.22 }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ReportTabs({ current }: { current: "appointments" | "leads" }) {
  const tabs = [
    { value: "appointments", label: "Appointments" },
    { value: "leads", label: "Leads" },
  ] as const

  return (
    <div className="flex gap-1.5">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={`/reports?tab=${t.value}`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            current === t.value
              ? "bg-black text-white dark:bg-white dark:text-black"
              : "border border-black/18 text-black/60 hover:border-black/30 dark:border-white/10 dark:text-white/60"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}

/**
 * A figure the data cannot support yet, said out loud.
 *
 * A report that silently omits a metric reads as "we measured and it was
 * nothing". Naming what is missing, and why, is the difference between a gap
 * someone can close and one nobody knows about.
 */
export function NotTracked({ what, why }: { what: string; why: string }) {
  return (
    <div className="rounded-md border border-dashed border-black/22 px-4 py-3 text-sm dark:border-white/15">
      <p className="font-medium text-black/60 dark:text-white/50">{what}</p>
      <p className="mt-0.5 text-xs text-black/60 dark:text-white/40">{why}</p>
    </div>
  )
}

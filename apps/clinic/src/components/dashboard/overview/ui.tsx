import Link from "next/link"
import { ArrowRight } from "lucide-react"

/**
 * The pieces every dashboard block is built from.
 *
 * Shared so the three blocks read as one page rather than three designs that
 * happen to be stacked.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  color,
  hint,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  color: string
  hint?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-black/12 bg-white px-3 py-2.5 transition hover:border-black/25 dark:border-white/10 dark:bg-black dark:hover:border-white/25">
      <div className={`shrink-0 rounded-md p-2 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-black/60 dark:text-white/60">{label}</p>
        <p className="text-xl font-semibold leading-tight tracking-tight tabular-nums">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {hint && <p className="truncate text-[11px] leading-snug text-black/55 dark:text-white/40">{hint}</p>}
      </div>
    </div>
  )
}

/**
 * A dashboard tile.
 *
 * `fill` is for tiles that share a grid row: the row is as tall as its tallest
 * tile, and without h-full a shorter one stops at its content and leaves a gap
 * above whatever comes next. The body grows into that space instead — worth
 * having only if the body can use it, so anything with room to breathe (a
 * chart) takes flex-1 inside.
 *
 * It is off by default, and that is the whole point. A tile standing on its
 * own has no row to match, and h-full there resolves against whichever
 * ancestor happens to have a definite height — which is how the last tile on
 * the page ended up with a border drawn at someone else's height and its own
 * content spilling out the bottom of it.
 */
export function Panel({
  title,
  icon: Icon,
  action,
  fill = false,
  scroll = false,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  /** Match the height of the tallest tile in the same grid row. */
  fill?: boolean
  /**
   * A list that can grow: the panel keeps the row's height (on a wide screen,
   * the panel beside it decides it) and the list scrolls inside, instead of
   * stretching the whole dashboard. Put it in a `relative` grid cell.
   */
  scroll?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border border-black/12 bg-white p-3 sm:p-4 dark:border-white/10 dark:bg-black ${
        fill ? "h-full" : ""
      } ${scroll ? "max-h-[420px] lg:absolute lg:inset-0 lg:max-h-none" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 shrink-0 text-primary" /> {title}
        </h2>
        {action}
      </div>
      <div className={`flex min-h-0 flex-1 flex-col ${scroll ? "overflow-y-auto pr-1" : ""}`}>{children}</div>
    </div>
  )
}

export function PanelLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
    >
      {label} <ArrowRight className="h-3 w-3" />
    </Link>
  )
}

export function Empty({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  hint: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center text-black/65 dark:text-white/40">
      <Icon className="mb-2 h-7 w-7 opacity-30" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs">{hint}</p>
    </div>
  )
}

export function formatDateTime(date: Date) {
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function dayBounds() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

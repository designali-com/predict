"use client"

import type { ComponentType, ReactNode } from "react"

/**
 * The building blocks of a patient's record page — one look for every tab.
 *
 * Each tab used to bring its own card, its own empty state and its own table,
 * written out again in every file, and they drifted: three borders, two title
 * styles, empty states that were dashed in one place and plain in the next.
 * Everything on the record now comes from here.
 */

type Icon = ComponentType<{ className?: string }>

// ── Section ──────────────────────────────────────────────────────────────────

/** A titled card. The action sits on the right of the title row. */
export function RecordSection({
  title,
  icon: IconCmp,
  description,
  action,
  children,
  className = "",
}: {
  title: string
  icon?: Icon
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  // A section can be just its header and an action (a collapsed panel) — then
  // no empty padded body under it.
  const hasBody = Boolean(description) || (children !== null && children !== undefined && children !== false)
  return (
    <section
      className={`rounded-xl border border-black/10 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-black ${className}`}
    >
      <header className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 ${hasBody ? "border-b border-black/[0.06] dark:border-white/[0.06]" : ""}`}>
        <div className="flex min-w-0 items-center gap-2">
          {IconCmp && <IconCmp className="size-3.5 shrink-0 text-primary" />}
          <h2 className="truncate text-[11px] font-semibold tracking-[0.12em] text-black/70 uppercase dark:text-white/55">
            {title}
          </h2>
        </div>
        {action && <div className="flex flex-wrap items-center gap-1.5">{action}</div>}
      </header>
      {hasBody && (
        <div className="p-4">
          {description && <p className="-mt-1 mb-3 text-xs text-black/55 dark:text-white/40">{description}</p>}
          {children}
        </div>
      )}
    </section>
  )
}

// ── Empty ────────────────────────────────────────────────────────────────────

/** Nothing here yet — said plainly, with the way to add it when there is one. */
export function RecordEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-black/15 px-4 py-6 text-center dark:border-white/12">
      <p className="text-sm text-black/55 dark:text-white/40">{children}</p>
      {action}
    </div>
  )
}

// ── Tabs and segments ────────────────────────────────────────────────────────

export interface RecordTab<K extends string> {
  key: K
  label: string
  icon: Icon
  count?: number
}

/** The record's main tabs: icon, label and a count when there is one. Scrolls sideways on a phone. */
export function RecordTabs<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: RecordTab<K>[]
  active: K
  onChange: (key: K) => void
}) {
  return (
    <nav
      aria-label="Patient record"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-black/10 px-1 [scrollbar-width:none] dark:border-white/10 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map(({ key, label, icon: IconCmp, count }) => {
        const on = key === active
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-current={on ? "page" : undefined}
            className={`relative flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-2 text-[13px] font-medium transition-colors ${
              on
                ? "text-primary"
                : "text-black/55 hover:text-black/85 dark:text-white/45 dark:hover:text-white/80"
            }`}
          >
            <IconCmp className="size-4" />
            {label}
            {count != null && count > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums leading-4 ${
                  on ? "bg-primary/12 text-primary" : "bg-black/[0.06] text-black/55 dark:bg-white/10 dark:text-white/50"
                }`}
              >
                {count}
              </span>
            )}
            {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        )
      })}
    </nav>
  )
}

/** Parts of one tab, as a compact pill switch. */
export function RecordSegments<K extends string>({
  segments,
  active,
  onChange,
}: {
  segments: { key: K; label: string; count?: number }[]
  active: K
  onChange: (key: K) => void
}) {
  return (
    <div className="inline-flex max-w-full gap-0.5 self-start overflow-x-auto rounded-lg border border-black/10 bg-black/[0.06] p-0.5 [scrollbar-width:none] dark:border-white/10 dark:bg-white/[0.07] [&::-webkit-scrollbar]:hidden">
      {segments.map(({ key, label, count }) => {
        const on = key === active
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              on
                ? "bg-white text-black shadow-sm ring-1 ring-black/10 dark:bg-white/20 dark:text-white dark:ring-white/15"
                : "text-black/65 hover:text-black/90 dark:text-white/60 dark:hover:text-white/85"
            }`}
          >
            {label}
            {count != null && count > 0 && <span className="text-[10px] tabular-nums opacity-60">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── Facts, stats, table ──────────────────────────────────────────────────────

/** One label and its value. A blank prints as a dash, never as an empty row. */
export function Fact({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-[0.12em] text-black/45 uppercase dark:text-white/35">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm ${mono ? "font-mono" : ""}`}>{value?.trim() ? value : "—"}</dd>
    </div>
  )
}

/** A number worth seeing first, with what it counts underneath. */
export function RecordStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3.5 py-3 dark:border-white/10 dark:bg-black">
      <p className="text-[11px] text-black/50 dark:text-white/40">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-black/45 dark:text-white/35">{sub}</p>}
    </div>
  )
}

/** A plain table; right-aligned columns get tabular figures. */
export function RecordTable({
  head,
  rows,
  align = [],
  minWidth = 520,
  rowKey,
}: {
  head: ReactNode[]
  rows: ReactNode[][]
  align?: ("left" | "right")[]
  minWidth?: number
  rowKey?: (index: number) => string
}) {
  const right = (i: number) => align[i] === "right"
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-black/15 text-[10px] tracking-[0.1em] text-black/60 uppercase dark:border-white/15 dark:text-white/55">
            {head.map((h, i) => (
              <th key={i} className={`pb-2 font-semibold ${right(i) ? "text-right" : "text-left"} ${i ? "pl-3" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.1] dark:divide-white/[0.1]">
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(i) : i}>
              {r.map((cell, j) => (
                <td key={j} className={`py-2 align-top ${right(j) ? "text-right tabular-nums" : ""} ${j ? "pl-3" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Small things ─────────────────────────────────────────────────────────────

const TONES = {
  neutral: "bg-black/[0.05] text-black/65 dark:bg-white/10 dark:text-white/60",
  primary: "bg-primary/10 text-primary",
  good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "bg-amber-500/12 text-amber-800 dark:text-amber-300",
  bad: "bg-red-500/10 text-red-700 dark:text-red-400",
} as const

/** A status word in a coloured pill. */
export function RecordBadge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${TONES[tone]}`}>
      {children}
    </span>
  )
}

/** "12 Oct 2026", in the clinic's zone. */
export function recordDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
}

/** "12 Oct 2026, 4:30 pm", in the clinic's zone. */
export function recordDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  })
}

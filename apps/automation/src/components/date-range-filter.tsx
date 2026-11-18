"use client"

import { CalendarDays, ChevronDown, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"

/** YYYY-MM-DD for a date, in the viewer's own calendar (IST for the team). */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function presets(): { label: string; from: string; to: string }[] {
  const today = new Date()
  const ago = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
  return [
    { label: "Today", from: ymd(today), to: ymd(today) },
    { label: "Yesterday", from: ymd(ago(1)), to: ymd(ago(1)) },
    { label: "Last 7 days", from: ymd(ago(6)), to: ymd(today) },
    { label: "Last 30 days", from: ymd(ago(29)), to: ymd(today) },
    { label: "This month", from: ymd(monthStart), to: ymd(today) },
    { label: "Last month", from: ymd(lastMonthStart), to: ymd(lastMonthEnd) },
  ]
}

const short = (v: string) =>
  new Date(`${v}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

/**
 * From–to date filter for a list: quick ranges plus two date boxes. Empty on
 * both ends means not filtered; one end alone is open-ended.
 */
export function DateRangeFilter({
  from,
  to,
  onChange,
  label = "Any date",
}: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  label?: string
}) {
  const list = presets()
  const preset = list.find((p) => p.from === from && p.to === to)
  const summary = preset
    ? preset.label
    : from && to
      ? from === to
        ? short(from)
        : `${short(from)} – ${short(to)}`
      : from
        ? `From ${short(from)}`
        : to
          ? `Until ${short(to)}`
          : label
  const active = !!(from || to)

  return (
    <Popover>
      <PopoverTrigger
        className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs focus:border-ring focus:outline-none ${
          active ? "border-primary/50 bg-primary/10 text-foreground" : "border-border bg-background"
        }`}
      >
        <CalendarDays className="size-3.5 opacity-70" />
        <span className="whitespace-nowrap">{summary}</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-3 p-3">
        <div className="grid grid-cols-2 gap-1.5">
          {list.map((p) => {
            const on = p.from === from && p.to === to
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(p.from, p.to)}
                className={`rounded-md border px-2 py-1.5 text-xs ${
                  on ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-muted-foreground">
            From
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => onChange(e.target.value, to)}
              className="mt-1 block h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-ring focus:outline-none"
            />
          </label>
          <label className="text-[11px] text-muted-foreground">
            To
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => onChange(from, e.target.value)}
              className="mt-1 block h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-ring focus:outline-none"
            />
          </label>
        </div>
        {active && (
          <button
            type="button"
            onClick={() => onChange("", "")}
            className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" /> Clear dates
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

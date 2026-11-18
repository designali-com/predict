"use client"

import { Check, ChevronDown, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"

export interface FilterOption {
  value: string
  label: string
  /** Options sharing a group are listed under that heading. */
  group?: string
}

/**
 * A list filter where several values can be ticked at once. Nothing ticked
 * means not filtered. Sits in the same h-8 row as the page's other controls.
 */
export function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
  disabled,
  title,
}: {
  /** Shown when nothing is ticked, e.g. "Any lead status". */
  label: string
  options: FilterOption[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  title?: string
}) {
  const picked = new Set(value)
  const toggle = (v: string) => onChange(picked.has(v) ? value.filter((x) => x !== v) : [...value, v])
  const first = options.find((o) => o.value === value[0])?.label

  const summary =
    value.length === 0 ? label : value.length === 1 ? (first ?? value[0]) : `${first ?? value[0]} +${value.length - 1}`

  const groups: { name?: string; items: FilterOption[] }[] = []
  for (const o of options) {
    const g = groups.find((x) => x.name === o.group)
    if (g) g.items.push(o)
    else groups.push({ name: o.group, items: [o] })
  }

  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        title={title}
        className={`inline-flex h-8 max-w-56 items-center gap-1 rounded-md border px-2 text-xs focus:border-ring focus:outline-none disabled:opacity-40 ${
          value.length ? "border-primary/50 bg-primary/10 text-foreground" : "border-border bg-background"
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0 p-1">
        <div className="flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground">
          <span>{value.length ? `${value.length} selected` : label}</span>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="inline-flex items-center gap-0.5 rounded px-1 hover:text-foreground"
            >
              <X className="size-3" /> Clear
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {groups.map((g, gi) => (
            <div key={g.name ?? gi}>
              {g.name && (
                <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.name}
                </p>
              )}
              {g.items.map((o) => {
                const on = picked.has(o.value)
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      }`}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

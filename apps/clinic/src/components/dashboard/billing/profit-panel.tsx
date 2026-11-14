"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useState } from "react"
import { Scale } from "lucide-react"
import { EXPENSE_CATEGORY_LABEL } from "@workspace/db/expense"
import { CARD, MUTED, Shares, Tile, day, monthStart, money, shortDate, type Split } from "./billing-ui"

const CATEGORY_LABEL = new Map<string, string>(Object.entries(EXPENSE_CATEGORY_LABEL))

interface Month {
  month: string
  incomeInPaise: number
  expenseInPaise: number
  netInPaise: number
}

interface Overview {
  from: string
  to: string
  collectedInPaise: number
  spentInPaise: number
  netInPaise: number
  byCategory: Split[]
  months: Month[]
}

/** The first and last day of last month. */
function lastMonth(): { from: string; to: string } {
  const first = new Date(`${monthStart()}T00:00:00Z`)
  first.setUTCMonth(first.getUTCMonth() - 1)
  const end = new Date(`${monthStart()}T00:00:00Z`)
  end.setUTCDate(0)
  return { from: first.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}

const RANGES = [
  { key: "month", label: "This month", range: () => ({ from: monthStart(), to: day(0) }) },
  { key: "last", label: "Last month", range: lastMonth },
  { key: "90", label: "90 days", range: () => ({ from: day(-89), to: day(0) }) },
]

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })
}

/**
 * Collected − spent = net. Admin and manager only: salaries are in the spend,
 * and the margin is the owner's number, not the desk's.
 */
export function ProfitPanel() {
  const [range, setRange] = useState(RANGES[0]!.range())
  const [data, setData] = useState<Overview | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/staff/expenses/overview?from=${range.from}&to=${range.to}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setData(d))
      .catch(() => live && setData(null))
    return () => {
      live = false
    }
  }, [range])

  const active = RANGES.find((r) => {
    const x = r.range()
    return x.from === range.from && x.to === range.to
  })?.key

  if (!data) {
    return (
      <div className={`${CARD} flex justify-center py-10`}>
        <PredictSpinner />
      </div>
    )
  }

  const margin = data.collectedInPaise > 0 ? Math.round((data.netInPaise / data.collectedInPaise) * 100) : null
  const peak = Math.max(1, ...data.months.flatMap((m) => [m.incomeInPaise, m.expenseInPaise]))

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Scale className="h-4 w-4" />
          Profit
          <span className={`font-normal ${MUTED}`}>
            {shortDate(data.from)} – {shortDate(data.to)}
          </span>
        </h2>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <Button key={r.key} size="sm" variant={active === r.key ? "default" : "outline"} onClick={() => setRange(r.range())}>
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Collected" value={money(data.collectedInPaise)} hint="every payment, all methods" tone="good" />
        <Tile label="Expenses" value={money(data.spentInPaise)} hint="everything entered under Expenses" tone={data.spentInPaise > 0 ? "bad" : undefined} />
        <Tile
          label="Net"
          value={money(data.netInPaise)}
          hint="collected − expenses"
          tone={data.netInPaise >= 0 ? "good" : "bad"}
        />
        <Tile label="Margin" value={margin == null ? "—" : `${margin}%`} hint="of what was collected" tone={margin != null && margin < 0 ? "bad" : undefined} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Two series, so a legend; the months read left to right, oldest first. */}
        <div className={`${CARD} flex flex-col p-4 lg:col-span-2`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Last 6 months</h3>
            <span className={`flex items-center gap-3 text-[11px] ${MUTED}`}>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Collected
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-red-400" /> Expenses
              </span>
            </span>
          </div>
          <div className="flex min-h-44 flex-1 items-end gap-3 border-b border-black/12 dark:border-white/10" role="img" aria-label="Collected and spent per month">
            {data.months.map((m) => (
              <div
                key={m.month}
                className="flex h-full flex-1 items-end justify-center gap-1"
                title={`${monthLabel(m.month)} — collected ${money(m.incomeInPaise)}, spent ${money(m.expenseInPaise)}, net ${money(m.netInPaise)}`}
              >
                <div className="w-1/3 max-w-6 rounded-t-[4px] bg-emerald-500/80" style={{ height: `${m.incomeInPaise > 0 ? Math.max(2, (m.incomeInPaise / peak) * 100) : 0}%` }} />
                <div className="w-1/3 max-w-6 rounded-t-[4px] bg-red-400/80" style={{ height: `${m.expenseInPaise > 0 ? Math.max(2, (m.expenseInPaise / peak) * 100) : 0}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-3">
            {data.months.map((m) => (
              <div key={m.month} className="flex-1 text-center">
                <p className={`text-[11px] ${MUTED}`}>{monthLabel(m.month)}</p>
                <p
                  className={`text-[11px] font-medium tabular-nums ${
                    m.netInPaise < 0 ? "text-red-700 dark:text-red-400" : m.netInPaise > 0 ? "text-emerald-700 dark:text-emerald-400" : MUTED
                  }`}
                >
                  {money(m.netInPaise)}
                </p>
              </div>
            ))}
          </div>
        </div>
        <Shares title="Where the money went" rows={data.byCategory} labels={CATEGORY_LABEL} total={data.spentInPaise} unit="expense" />
      </div>
    </section>
  )
}

"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useMemo, useState } from "react"
import { Download, TriangleAlert } from "lucide-react"
import { INPUT, LABEL, daysAgo, qty, rupees, shortDate } from "./stock-styles"

interface MedicineRow {
  medicineId: string
  name: string
  unit: string
  inQty: number
  outQty: number
  consumedQty: number
  dispensedQty: number
  purchasedQty: number
  purchaseValueInPaise: number
  onHand: number
  reorderLevel: number
  low: boolean
  lastUnitCostInPaise: number | null
  valueInPaise: number | null
  daysOfCover: number | null
}

interface Report {
  from: string
  to: string
  days: number
  medicines: MedicineRow[]
  byKind: { kind: string; label: string; direction: "in" | "out"; quantity: number; movements: number }[]
  daily: { date: string; consumed: number; received: number }[]
  totals: {
    movements: number
    inQty: number
    outQty: number
    purchaseValueInPaise: number
    stockValueInPaise: number
    priced: number
    unpriced: number
  }
  expiring: {
    medicineId: string
    name: string
    unit: string
    batchNo: string
    expiresOn: string
    quantity: number
    daysLeft: number
  }[]
}

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
]

/**
 * What the storeroom did, and what it is worth.
 *
 * Two different clocks live on this page and the labels say which is which:
 * the movement columns are for the period chosen, while on-hand, value and
 * days of cover are for today. A report that quietly mixed them would look
 * more coherent and be wrong.
 */
export function StockReport() {
  const [range, setRange] = useState({ from: daysAgo(29), to: daysAgo(0) })
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    fetch(`/api/staff/stock?view=report&from=${range.from}&to=${range.to}`)
      .then((r) => r.json())
      .then((data) => live && setReport(data?.report ?? null))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [range])

  const peak = useMemo(
    () => Math.max(1, ...(report?.daily ?? []).map((d) => d.consumed)),
    [report],
  )

  const download = () => {
    if (!report) return
    const head = ["Medicine", "Unit", "Purchased", "Consumed", "Dispensed", "Total out", "On hand", "Days of cover", "Last unit cost", "Stock value"]
    const body = report.medicines.map((m) =>
      [
        m.name,
        m.unit,
        m.purchasedQty,
        m.consumedQty,
        m.dispensedQty,
        m.outQty,
        m.onHand,
        m.daysOfCover ?? "",
        m.lastUnitCostInPaise === null ? "" : (m.lastUnitCostInPaise / 100).toFixed(2),
        m.valueInPaise === null ? "" : (m.valueInPaise / 100).toFixed(2),
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    )
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `stock-report-${report.from}-to-${report.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && !report) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  if (!report) {
    return <p className="text-sm text-black/60 dark:text-white/40">Could not load the report.</p>
  }

  const expiringSoon = report.expiring.filter((b) => b.daysLeft <= 90)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-black/18 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="flex gap-1.5">
          {PRESETS.map((p) => {
            const active = report.days === p.days
            return (
              <Button variant="ghost" size="default"
                key={p.days}
                onClick={() => setRange({ from: daysAgo(p.days - 1), to: daysAgo(0) })}
                className={`border px-3 py-2 text-sm ${
 active
 ?"border-transparent bg-primary text-primary-foreground"
 :"border-black/18 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
 }`}
              >
                {p.label}
              </Button>
            )
          })}
        </div>
        <label>
          <span className={LABEL}>From</span>
          <input
            type="date"
            value={report.from}
            onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })}
            className={INPUT}
          />
        </label>
        <label>
          <span className={LABEL}>To</span>
          <input
            type="date"
            value={report.to}
            onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })}
            className={INPUT}
          />
        </label>
        <Button variant="outline" size="default" className="ml-auto"
 onClick={download}

 >
          <Download className="h-3.5 w-3.5" />
          Download CSV
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Stock value today"
          value={rupees(report.totals.stockValueInPaise)}
          hint={
            report.totals.unpriced > 0
              ? `${report.totals.unpriced} medicine${report.totals.unpriced === 1 ? "" : "s"} never priced, not counted`
              : "at the last price paid"
          }
        />
        <Tile label="Used in therapy" value={qty(report.byKind.find((k) => k.kind === "consumption")?.quantity ?? 0)} hint={`over ${report.days} days`} />
        <Tile label="Received" value={qty(report.totals.inQty)} hint={rupees(report.totals.purchaseValueInPaise) + " purchased"} />
        <Tile label="Movements" value={report.totals.movements.toLocaleString("en-IN")} hint="entries in the ledger" />
      </div>

      <section className="rounded-md border border-black/18 bg-white p-4 dark:border-white/10 dark:bg-black">
        <h2 className="text-sm font-semibold">Used in therapy, by day</h2>
        <p className="mb-4 text-xs text-black/60 dark:text-white/40">
          Every unit the clinic burned through, per day. Peak {qty(peak)} on a single day.
        </p>
        {/* One series, so no legend: the heading names it. Hover a bar for the
            day and the number; the table below carries the same figures. */}
        <div className="flex h-24 items-end gap-[2px]" role="img" aria-label="Daily consumption">
          {report.daily.map((d) => (
            <div
              key={d.date}
              title={`${shortDate(d.date)} — ${qty(d.consumed)} used`}
              className="group flex h-full flex-1 items-end"
            >
              <div
                className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
                style={{ height: `${Math.max(d.consumed > 0 ? 3 : 1, (d.consumed / peak) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-black/60 dark:text-white/40">
          <span>{shortDate(report.from)}</span>
          <span>{shortDate(report.to)}</span>
        </div>
      </section>

      {expiringSoon.length > 0 && (
        <section className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <TriangleAlert className="h-4 w-4" />
            Expiring within 90 days
          </h2>
          <ul className="mt-2 grid gap-1.5 text-sm text-amber-900 dark:text-amber-200">
            {expiringSoon.map((b) => (
              <li key={b.medicineId + b.batchNo} className="flex flex-wrap justify-between gap-2">
                <span>
                  <span className="font-medium">{b.name}</span> · batch {b.batchNo}
                </span>
                <span className="tabular-nums">
                  {qty(b.quantity)} {b.unit} ·{" "}
                  {b.daysLeft < 0 ? `expired ${-b.daysLeft} days ago` : `${b.daysLeft} days left`}
                </span>
              </li>
            ))}
          </ul>
          {/* Said plainly, because the number is only as good as the tagging. */}
          <p className="mt-2 text-[11px] text-amber-900/80 dark:text-amber-200/70">
            Counts only movements entered with that batch number — anything taken out without one
            is not subtracted here.
          </p>
        </section>
      )}

      <section className="rounded-md border border-black/18 bg-white dark:border-white/10 dark:bg-black">
        <div className="border-b border-black/12 p-4 dark:border-white/5">
          <h2 className="text-sm font-semibold">Medicine by medicine</h2>
          <p className="text-xs text-black/60 dark:text-white/40">
            Movement columns cover {shortDate(report.from)} to {shortDate(report.to)}. On hand, cover
            and value are as of today.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[54rem] text-sm">
            <thead className="border-b border-black/12 text-left text-xs text-black/65 dark:border-white/5 dark:text-white/45">
              <tr>
                <th className="px-4 py-2 font-medium">Medicine</th>
                <th className="px-3 py-2 text-right font-medium">Bought</th>
                <th className="px-3 py-2 text-right font-medium">Therapy</th>
                <th className="px-3 py-2 text-right font-medium">Given out</th>
                <th className="px-3 py-2 text-right font-medium">On hand</th>
                <th className="px-3 py-2 text-right font-medium">Cover</th>
                <th className="px-4 py-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {report.medicines.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-black/60 dark:text-white/40">
                    Nothing moved in this period and nothing is held.
                  </td>
                </tr>
              )}
              {report.medicines.map((m) => (
                <tr key={m.medicineId} className="border-b border-black/12 last:border-0 dark:border-white/5">
                  <td className="px-4 py-2">
                    <span className="font-medium">{m.name}</span>
                    <span className="block text-[11px] text-black/60 dark:text-white/40">{m.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-black/70 dark:text-white/55">
                    {m.purchasedQty > 0 ? qty(m.purchasedQty) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-black/70 dark:text-white/55">
                    {m.consumedQty > 0 ? qty(m.consumedQty) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-black/70 dark:text-white/55">
                    {m.dispensedQty > 0 ? qty(m.dispensedQty) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`font-medium tabular-nums ${
                        m.low ? "text-amber-700 dark:text-amber-400" : ""
                      }`}
                    >
                      {qty(m.onHand)}
                    </span>
                    {m.low && (
                      <span className="block text-[11px] text-amber-700 dark:text-amber-400">at reorder level</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {m.daysOfCover === null ? (
                      <span className="text-black/45 dark:text-white/30" title="Not used in therapy during this period, so there is no rate to project from">
                        —
                      </span>
                    ) : (
                      <span className={m.daysOfCover < 7 ? "font-medium text-red-700 dark:text-red-400" : "text-black/70 dark:text-white/55"}>
                        {m.daysOfCover}d
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {m.valueInPaise === null ? (
                      <span className="text-black/45 dark:text-white/30" title="Never bought at a recorded price">
                        not priced
                      </span>
                    ) : (
                      <>
                        {rupees(m.valueInPaise)}
                        <span className="block text-[11px] text-black/60 dark:text-white/40">
                          {rupees(m.lastUnitCostInPaise ?? 0)} each
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {report.byKind.length > 0 && (
        <section className="rounded-md border border-black/18 bg-white p-4 dark:border-white/10 dark:bg-black">
          <h2 className="mb-3 text-sm font-semibold">Where it went</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {report.byKind.map((k) => (
              <li key={k.kind} className="rounded-md border border-black/12 p-3 dark:border-white/5">
                <p className="text-[11px] uppercase tracking-widest text-black/60 dark:text-white/40">
                  {k.label}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  <span className={k.direction === "in" ? "text-emerald-700 dark:text-emerald-400" : ""}>
                    {k.direction === "in" ? "+" : "−"}
                    {qty(k.quantity)}
                  </span>
                </p>
                <p className="text-[11px] text-black/60 dark:text-white/40">
                  {k.movements} entr{k.movements === 1 ? "y" : "ies"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-black/18 bg-white p-4 dark:border-white/10 dark:bg-black">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-black/60 dark:text-white/40">{hint}</p>
    </div>
  )
}

"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useMemo, useState } from "react"
import { Printer, TrendingUp, TriangleAlert } from "lucide-react"
import { ListPagination, usePaged } from "@/src/components/dashboard/list-pagination"

interface Split {
  key: string
  label: string
  amountInPaise: number
  count: number
}

interface Recent {
  paymentId: string
  receiptNo: string | null
  name: string | null
  amountInPaise: number
  method: string
  kind: string
  collectedAt: string
  voidedAt: string | null
  collectedBy: string | null
}

interface Report {
  from: string
  to: string
  days: number
  totals: {
    collectedInPaise: number
    receipts: number
    patients: number
    voidedInPaise: number
    voidedCount: number
    averageInPaise: number
  }
  byMethod: Split[]
  byKind: Split[]
  byCollector: Split[]
  daily: { date: string; amountInPaise: number; count: number }[]
  unpaidConsultationInPaise: number
  unpaidConsultationCount: number
  recent: Recent[]
}

const PRESETS = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
]

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCMinutes(d.getUTCMinutes() + 330 - n * 24 * 60)
  return d.toISOString().slice(0, 10)
}

/** Whole rupees — the paise on a month's takings are noise, not precision. */
function money(paise: number): string {
  return "₹" + Math.round(paise / 100).toLocaleString("en-IN")
}

function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return date
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  })
}

/**
 * What came in, in what form, and who took it.
 *
 * The tables below this answer "who owes us". This answers the question the
 * desk is actually asked at closing — and the breakdown by method is the one
 * that matters, because it is what the cash in the drawer is counted against.
 */
export function BillingAnalytics() {
  const [range, setRange] = useState({ from: daysAgo(29), to: daysAgo(0) })
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    fetch(`/api/staff/billing?view=report&from=${range.from}&to=${range.to}`)
      .then((r) => r.json())
      .then((d) => live && setReport(d?.report ?? null))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [range])

  const peak = useMemo(
    () => Math.max(1, ...(report?.daily ?? []).map((d) => d.amountInPaise)),
    [report],
  )
  const receipts = useMemo(() => report?.recent ?? [], [report])
  const paged = usePaged(receipts)

  if (loading && !report) {
    return (
      <div className="flex justify-center rounded-md border border-black/18 py-12 dark:border-white/10">
        <PredictSpinner />
      </div>
    )
  }
  if (!report) return null

  const cash = report.byMethod.find((m) => m.key === "cash")

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4" />
          Collections
          <span className="font-normal text-black/60 dark:text-white/40">
            {shortDate(report.from)} – {shortDate(report.to)}
          </span>
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Button variant="ghost" size="sm"
              key={p.days}
              onClick={() => setRange({ from: daysAgo(p.days - 1), to: daysAgo(0) })}
              className={`border px-3 py-1.5 text-xs font-medium ${
 report.days === p.days
 ?"border-transparent bg-primary text-primary-foreground"
 :"border-black/18 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
 }`}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Collected" value={money(report.totals.collectedInPaise)} hint={`${report.totals.receipts} receipt${report.totals.receipts === 1 ? "" : "s"}`} />
        {/* The drawer figure. Everything else can be checked against a statement;
            this one is checked against notes in a till. */}
        <Tile
          label="Of that, cash"
          value={money(cash?.amountInPaise ?? 0)}
          hint={cash ? `${cash.count} payment${cash.count === 1 ? "" : "s"} — count the drawer` : "no cash taken"}
        />
        <Tile label="Patients who paid" value={String(report.totals.patients)} hint={`${money(report.totals.averageInPaise)} average`} />
        <Tile
          label="Fees unpaid"
          value={money(report.unpaidConsultationInPaise)}
          hint={`${report.unpaidConsultationCount} visit${report.unpaidConsultationCount === 1 ? "" : "s"} still short`}
          warn={report.unpaidConsultationInPaise > 0}
        />
      </div>

      {report.totals.voidedCount > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {report.totals.voidedCount} payment{report.totals.voidedCount === 1 ? " was" : "s were"}{" "}
            cancelled in this period, worth {money(report.totals.voidedInPaise)}. Not counted above —
            but a receipt was printed for {report.totals.voidedCount === 1 ? "it" : "them"}.
          </span>
        </p>
      )}

      <div className="rounded-md border border-black/18 bg-white p-4 dark:border-white/10 dark:bg-black">
        <p className="mb-3 text-xs text-black/60 dark:text-white/40">
          Taken per day. Busiest day {money(peak)}.
        </p>
        {/* One series, so no legend — the line above names it. */}
        <div className="flex h-20 items-end gap-[2px]" role="img" aria-label="Collections per day">
          {report.daily.map((d) => (
            <div
              key={d.date}
              title={`${shortDate(d.date)} — ${money(d.amountInPaise)} from ${d.count} receipt${d.count === 1 ? "" : "s"}`}
              className="group flex h-full flex-1 items-end"
            >
              <div
                className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
                style={{ height: `${Math.max(d.amountInPaise > 0 ? 3 : 1, (d.amountInPaise / peak) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-black/60 dark:text-white/40">
          <span>{shortDate(report.from)}</span>
          <span>{shortDate(report.to)}</span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <SplitCard title="By method" subtitle="What to reconcile against" rows={report.byMethod} total={report.totals.collectedInPaise} />
        <SplitCard title="By what it paid for" subtitle="Fees against courses" rows={report.byKind} total={report.totals.collectedInPaise} />
        <SplitCard title="Taken by" subtitle="Who was on the desk" rows={report.byCollector} total={report.totals.collectedInPaise} />
      </div>

      <div className="rounded-md border border-black/18 bg-white dark:border-white/10 dark:bg-black">
        <div className="border-b border-black/12 p-4 dark:border-white/5">
          <h3 className="text-sm font-semibold">
            Receipts <span className="font-normal text-black/60 dark:text-white/40">{receipts.length}</span>
          </h3>
          <p className="text-xs text-black/60 dark:text-white/40">
            Newest first. Nowhere else lists these by number — a patient who rings up quoting one
            had to be found through their record.
          </p>
        </div>
        {report.recent.length === 0 ? (
          <p className="p-6 text-center text-sm text-black/60 dark:text-white/40">
            Nothing collected in this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-black/12 text-left text-xs text-black/65 dark:border-white/5 dark:text-white/45">
                <tr>
                  <th className="px-4 py-2 font-medium">Receipt</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">For</th>
                  <th className="px-3 py-2 font-medium">Taken by</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {paged.shown.map((p) => (
                  <tr key={p.paymentId} className="border-b border-black/12 last:border-0 dark:border-white/5">
                    <td className="px-4 py-2">
                      <span className={`font-mono text-xs font-medium ${p.voidedAt ? "line-through opacity-60" : ""}`}>
                        {p.receiptNo ?? "—"}
                      </span>
                      <span className="block text-[11px] text-black/60 dark:text-white/40">
                        {new Date(p.collectedAt).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">{p.name ?? "Unknown"}</td>
                    <td className="px-3 py-2 text-xs capitalize text-black/60 dark:text-white/40">
                      {p.kind.replace("_", " ")} · {p.method}
                    </td>
                    <td className="px-3 py-2 text-xs text-black/60 dark:text-white/40">
                      {p.collectedBy ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-medium tabular-nums ${p.voidedAt ? "line-through opacity-60" : ""}`}>
                        {money(p.amountInPaise)}
                      </span>
                      {p.voidedAt && (
                        <span className="block text-[11px] text-red-700 dark:text-red-400">cancelled</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <a
                        href={`/receipt/${p.paymentId}`}
                        target="_blank"
                        rel="noreferrer"
                        title={p.receiptNo ? `Receipt ${p.receiptNo}` : "Receipt"}
                        className="inline-flex rounded p-1 text-black/60 hover:text-black dark:text-white/40 dark:hover:text-white"
                        aria-label="Open the receipt"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {receipts.length > 0 && <ListPagination {...paged.bar} />}
    </section>
  )
}

function Tile({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <div className="rounded-md border border-black/18 bg-white p-4 dark:border-white/10 dark:bg-black">
      <p className="text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? "text-amber-700 dark:text-amber-400" : ""}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-black/60 dark:text-white/40">{hint}</p>
    </div>
  )
}

/** A breakdown with a bar per row, so the share reads without doing the sum. */
function SplitCard({
  title,
  subtitle,
  rows,
  total,
}: {
  title: string
  subtitle: string
  rows: Split[]
  total: number
}) {
  return (
    <div className="rounded-md border border-black/18 bg-white p-4 dark:border-white/10 dark:bg-black">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-3 text-[11px] text-black/60 dark:text-white/40">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-black/60 dark:text-white/40">Nothing in this period.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{r.label}</span>
                <span className="shrink-0 tabular-nums">{money(r.amountInPaise)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${total > 0 ? (r.amountInPaise / total) * 100 : 0}%` }}
                />
              </div>
              <span className="mt-0.5 block text-[11px] text-black/60 dark:text-white/40">
                {r.count} payment{r.count === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

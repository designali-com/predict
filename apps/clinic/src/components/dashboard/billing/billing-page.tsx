"use client"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Download, Printer, Search, TriangleAlert, Wallet, XCircle } from "lucide-react"
import { PAYMENT_KINDS, PAYMENT_METHODS } from "@workspace/db/payment"
import { formatPrice } from "@workspace/db/treatment-plan"
import { BillingAnalytics } from "./billing-analytics"
import { VoidPaymentDialog, type VoidablePayment } from "./void-payment-dialog"
import { CARD, CONTROL, MUTED, PRESETS, Shares, Tile, day, money, shortDate, type Split } from "./billing-ui"
import { ExpensesTab } from "./expenses-tab"
import { ProfitPanel } from "./profit-panel"
import { useMe } from "@/src/lib/use-me"
import { ListPagination, usePaged, type PageSize } from "@/src/components/dashboard/list-pagination"
import { EXPENSES_ALL } from "@workspace/db/expense"

/* ─────────────────────────────── shared ─────────────────────────────── */

const KIND_LABEL = new Map<string, string>(PAYMENT_KINDS.map((k) => [k.value, k.label]))
const METHOD_LABEL = new Map<string, string>(PAYMENT_METHODS.map((m) => [m.value, m.label]))

/* ─────────────────────────────── page ─────────────────────────────── */

const TABS = ["payments", "dues", "expenses", "summary"] as const
type Tab = (typeof TABS)[number]

/**
 * Billing: every payment in one list, what is still owed, what was spent,
 * and the report.
 *
 * Payments is the single record of money in — fees, courses, blood tests and
 * medicine all read from the one payment table, so the desk, the accountant
 * and the patient's own Billing tab can never disagree.
 */
export function BillingPage() {
  const [tab, setTab] = useState<Tab>("payments")
  const me = useMe()
  const seesProfit = me?.permissions.includes(EXPENSES_ALL) ?? false

  // The tab survives a refresh and can be linked to (#dues).
  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab
    if (TABS.includes(h)) setTab(h)
  }, [])
  const choose = (t: string) => {
    setTab(t as Tab)
    history.replaceState(null, "", `#${t}`)
  }

  return (
    <div className="flex w-full flex-col gap-4 p-4 lg:p-6">
      <PageHeader title="Billing" />
      <Tabs value={tab} onValueChange={choose}>
        <TabsList>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="dues">Dues</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTab />
        </TabsContent>
        <TabsContent value="dues" className="mt-4">
          <DuesTab />
        </TabsContent>
        <TabsContent value="expenses" className="mt-4">
          <ExpensesTab />
        </TabsContent>
        <TabsContent value="summary" className="mt-4 flex flex-col gap-6">
          {/* The margin is the owner's figure — salaries are in it. */}
          {seesProfit && <ProfitPanel />}
          <BillingAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ─────────────────────────────── payments ─────────────────────────────── */

interface LedgerRow {
  id: string
  collectedAt: string
  receiptNo: string | null
  kind: string
  method: string
  reference: string | null
  amountInPaise: number
  voided: boolean
  voidReason: string | null
  contactId: string
  patient: string | null
  phone: string | null
  collectedBy: string | null
}

interface Summary {
  collectedInPaise: number
  receipts: number
  voided: number
  byMethod: Split[]
  byKind: Split[]
  daily: { date: string; amountInPaise: number; count: number }[]
}

function PaymentsTab() {
  const [range, setRange] = useState(PRESETS[3]!.range())
  const [kind, setKind] = useState("")
  const [method, setMethod] = useState("")
  const [q, setQ] = useState("")
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [voiding, setVoiding] = useState<VoidablePayment | null>(null)
  const [busy, setBusy] = useState(false)

  // Typing searches after a pause, not on every key.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const params = useMemo(() => {
    const p = new URLSearchParams({ from: range.from, to: range.to })
    if (kind) p.set("kind", kind)
    if (method) p.set("method", method)
    if (query) p.set("q", query)
    return p.toString()
  }, [range, kind, method, query])

  // A new filter starts again from the first page.
  useEffect(() => setPage(1), [params, pageSize])

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/billing/payments?${params}&page=${page}&size=${pageSize}`)
    const data = await res.json().catch(() => null)
    setRows(data?.rows ?? [])
    setTotal(data?.total ?? 0)
    setSummary(data?.summary ?? null)
  }, [params, page, pageSize])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const preset = PRESETS.find((p) => {
    const r = p.range()
    return r.from === range.from && r.to === range.to
  })?.key

  async function cancelPayment(reason: string) {
    if (!voiding) return
    setBusy(true)
    try {
      const res = await fetch(`/api/staff/payments/${voiding.id}/void`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        alert(data?.error ?? "Could not cancel that payment")
        return
      }
      setVoiding(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const amountOf = (key: string) => summary?.byMethod.find((m) => m.key === key)
  const cash = amountOf("cash")
  const upi = amountOf("upi")
  const cardBank = (summary?.byMethod ?? []).filter((m) => m.key !== "cash" && m.key !== "upi")
  const cardBankTotal = cardBank.reduce((n, m) => n + m.amountInPaise, 0)
  const cardBankCount = cardBank.reduce((n, m) => n + m.count, 0)
  const count = (n?: number) => `${n ?? 0} payment${n === 1 ? "" : "s"}`

  return (
    <div className="flex flex-col gap-4">
      {/* Filters — one row above everything they change. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? "default" : "outline"}
              onClick={() => setRange(p.range())}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-sm">
          <input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
            className={CONTROL}
            aria-label="From"
          />
          <span className={MUTED}>–</span>
          <input
            type="date"
            value={range.to}
            min={range.from}
            onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
            className={CONTROL}
            aria-label="To"
          />
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={CONTROL} aria-label="For">
          <option value="">Everything</option>
          {PAYMENT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={CONTROL} aria-label="Method">
          <option value="">All methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="relative min-w-[12rem] flex-1">
          <Search className={`pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 ${MUTED}`} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, phone, receipt or UPI ref"
            className={`${CONTROL} w-full pl-8`}
          />
        </div>
        <a
          href={`/api/staff/billing/payments?${params}&format=csv`}
          download
          className={buttonVariants({ size: "sm", variant: "outline", className: "gap-1.5" })}
        >
          <Download /> CSV
        </a>
      </div>

      {loading && !summary ? (
        <div className={`${CARD} flex justify-center py-16`}>
          <PredictSpinner />
        </div>
      ) : (
        summary && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Tile
                label="Collected"
                value={money(summary.collectedInPaise)}
                hint={`${summary.receipts} receipt${summary.receipts === 1 ? "" : "s"}`}
                tone="good"
              />
              <Tile label="Cash" value={money(cash?.amountInPaise ?? 0)} hint={`${count(cash?.count)} · count the drawer`} />
              <Tile label="UPI" value={money(upi?.amountInPaise ?? 0)} hint={count(upi?.count)} />
              <Tile label="Card / bank" value={money(cardBankTotal)} hint={count(cardBankCount)} />
              <Tile
                label="Average"
                value={money(summary.receipts ? summary.collectedInPaise / summary.receipts : 0)}
                hint={summary.voided ? `${summary.voided} cancelled, not counted` : "per receipt"}
                tone={summary.voided ? "warn" : undefined}
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <DailyChart daily={summary.daily} />
              <div className="grid gap-3">
                <Shares title="By method" rows={summary.byMethod} labels={METHOD_LABEL} total={summary.collectedInPaise} />
                <Shares title="By what it paid for" rows={summary.byKind} labels={KIND_LABEL} total={summary.collectedInPaise} />
              </div>
            </div>

            <Ledger rows={rows} total={total} loading={loading} onVoid={setVoiding} />
            {total > 0 && <ListPagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />}
          </>
        )
      )}

      {voiding && (
        <VoidPaymentDialog payment={voiding} busy={busy} onConfirm={cancelPayment} onClose={() => setVoiding(null)} />
      )}
    </div>
  )
}

/** Collections per day: one series, so the title names it and no legend is needed. */
function DailyChart({ daily }: { daily: Summary["daily"] }) {
  const [hover, setHover] = useState<number | null>(null)
  const peak = Math.max(1, ...daily.map((d) => d.amountInPaise))
  const best = daily.reduce<Summary["daily"][number] | null>((b, d) => (!b || d.amountInPaise > b.amountInPaise ? d : b), null)
  const shown = hover != null ? daily[hover] : null
  // A single day has nothing to compare against; the tiles already say it.
  const oneDay = daily.length <= 1

  return (
    <div className={`${CARD} flex flex-col p-4 lg:col-span-2`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Collected per day</h3>
        <span className={`text-xs tabular-nums ${MUTED}`}>
          {shown
            ? `${shortDate(shown.date)} · ${money(shown.amountInPaise)} · ${shown.count} receipt${shown.count === 1 ? "" : "s"}`
            : best && best.amountInPaise > 0
              ? `Best day ${shortDate(best.date)} · ${money(best.amountInPaise)}`
              : "Nothing yet"}
        </span>
      </div>
      {oneDay ? (
        <p className={`flex flex-1 items-center justify-center py-10 text-sm ${MUTED}`}>
          Pick a longer range to see the day-by-day graph.
        </p>
      ) : (
        // The graph fills the card, however tall the cards beside it make it,
        // instead of sitting at the top with a gap underneath.
        <div className="flex flex-1 flex-col">
          <div
            className="relative mt-4 flex min-h-40 flex-1 items-end gap-[2px] border-b border-black/12 dark:border-white/10"
            role="img"
            aria-label="Collections per day"
            onMouseLeave={() => setHover(null)}
          >
            {/* Recessive guide at the peak, labelled once. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-black/10 dark:border-white/10" />
            <span className={`pointer-events-none absolute -top-0.5 right-0 -translate-y-full text-[10px] tabular-nums ${MUTED}`}>
              {money(peak)}
            </span>
            {daily.map((d, i) => (
              <div
                key={d.date}
                onMouseEnter={() => setHover(i)}
                className="flex h-full flex-1 cursor-default items-end"
              >
                <div
                  className={`w-full rounded-t-[4px] transition-colors ${
                    hover === i ? "bg-primary" : "bg-primary/70"
                  }`}
                  style={{ height: d.amountInPaise > 0 ? `${Math.max(3, (d.amountInPaise / peak) * 100)}%` : "1px" }}
                />
              </div>
            ))}
          </div>
          <div className={`mt-1.5 flex justify-between text-[11px] ${MUTED}`}>
            <span>{shortDate(daily[0]!.date)}</span>
            {daily.length > 2 && <span>{shortDate(daily[Math.floor(daily.length / 2)]!.date)}</span>}
            <span>{shortDate(daily[daily.length - 1]!.date)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Ledger({
  rows,
  total,
  loading,
  onVoid,
}: {
  rows: LedgerRow[]
  total: number
  loading: boolean
  onVoid: (p: VoidablePayment) => void
}) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-center justify-between gap-2 border-b border-black/12 px-4 py-3 dark:border-white/5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Wallet className="h-4 w-4" /> All payments
          <span className={`font-normal ${MUTED}`}>{total}</span>
        </h3>
        {loading && <PredictSpinner />}
      </div>
      {rows.length === 0 ? (
        <p className={`p-8 text-center text-sm ${MUTED}`}>No payments match.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className={`border-b border-black/12 text-left text-xs dark:border-white/5 ${MUTED}`}>
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Receipt</th>
                <th className="px-3 py-2 font-medium">Patient</th>
                <th className="px-3 py-2 font-medium">For</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Taken by</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const at = new Date(p.collectedAt)
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-black/8 last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03] ${
                      p.voided ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-4 py-2 whitespace-nowrap">
                      {at.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
                      <span className={`block text-[11px] ${MUTED}`}>
                        {at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                      </span>
                    </td>
                    <td className={`px-3 py-2 font-mono text-xs ${p.voided ? "line-through" : ""}`}>{p.receiptNo ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Link href={`/people/${p.contactId}`} className="font-medium hover:underline">
                        {p.patient ?? p.phone ?? "Unknown"}
                      </Link>
                      {p.phone && p.patient && <span className={`block text-[11px] ${MUTED}`}>{p.phone}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="rounded border border-black/12 px-1.5 py-0.5 dark:border-white/10">
                        {KIND_LABEL.get(p.kind) ?? p.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {METHOD_LABEL.get(p.method) ?? p.method}
                      {p.reference && <span className={`block max-w-[10rem] truncate text-[11px] ${MUTED}`}>{p.reference}</span>}
                    </td>
                    <td className={`px-3 py-2 text-xs ${MUTED}`}>{p.collectedBy ?? "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span className={`font-medium tabular-nums ${p.voided ? "line-through" : ""}`}>{formatPrice(p.amountInPaise)}</span>
                      {p.voided && (
                        <span className="block max-w-[12rem] truncate text-[11px] text-red-700 dark:text-red-400" title={p.voidReason ?? ""}>
                          cancelled{p.voidReason ? ` — ${p.voidReason}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <a
                        href={`/receipt/${p.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex rounded p-1 hover:text-black dark:hover:text-white ${MUTED}`}
                        aria-label="Open the receipt"
                        title="Receipt"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </a>
                      {!p.voided && (
                        <button
                          type="button"
                          onClick={() =>
                            onVoid({
                              id: p.id,
                              amountInPaise: p.amountInPaise,
                              method: p.method,
                              receiptNo: p.receiptNo,
                              collectedAt: p.collectedAt,
                            })
                          }
                          className={`inline-flex rounded p-1 hover:text-red-700 dark:hover:text-red-400 ${MUTED}`}
                          aria-label="Cancel this payment"
                          title="Cancel payment"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────── dues ─────────────────────────────── */

interface FeeRow {
  id: string
  contactId: string
  scheduledAt: string
  name: string | null
  phone: string | null
  balance: { dueInPaise: number; paidInPaise: number; outstandingInPaise: number }
}

interface PlanRow {
  enrollmentId: string
  contactId: string
  name: string | null
  phone: string | null
  planName: string
  status: string
  totalInPaise: number
  paidInPaise: number
  outstandingInPaise: number
  advancePercent: number
  advanceMet: boolean
}

interface TestRow {
  orderId: string
  contactId: string
  name: string | null
  phone: string | null
  orderedOn: string
  status: string
  totalInPaise: number
  paidInPaise: number
  outstandingInPaise: number
}

interface MedicineDueRow {
  id: string
  contactId: string
  name: string | null
  phone: string | null
  soldAt: string
  note: string | null
  totalInPaise: number
  paidInPaise: number
  outstandingInPaise: number
}

interface Due {
  key: string
  kind: "consultation" | "treatment_plan" | "blood_test" | "medicine"
  name: string
  detail: React.ReactNode
  totalInPaise: number
  paidInPaise: number
  outstandingInPaise: number
  href: string
  action: string
}

/**
 * What is owed, in one list. Every row links to the screen that takes the
 * money, because that screen already has the visit, course or test in front of
 * it — collecting from here would mean re-stating which, one more chance to put
 * a payment against the wrong one.
 */
function DuesTab() {
  const [date, setDate] = useState(day(0))
  const [data, setData] = useState<{ fees: FeeRow[]; plans: PlanRow[]; tests: TestRow[]; medicines: MedicineDueRow[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [only, setOnly] = useState<"" | Due["kind"]>("")

  useEffect(() => {
    let live = true
    setLoading(true)
    fetch(`/api/staff/billing?date=${date}`)
      .then((r) => r.json())
      .then((d) => live && setData({ fees: d?.fees ?? [], plans: d?.plans ?? [], tests: d?.tests ?? [], medicines: d?.medicines ?? [] }))
      .catch(() => live && setData({ fees: [], plans: [], tests: [], medicines: [] }))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [date])

  const dues = useMemo<Due[]>(() => {
    if (!data) return []
    const time = (iso: string) =>
      new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })
    return [
      ...data.fees.map((f) => ({
        key: `fee-${f.id}`,
        kind: "consultation" as const,
        name: f.name ?? f.phone ?? "Unknown",
        detail: `Visit ${new Date(f.scheduledAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}, ${time(f.scheduledAt)}`,
        totalInPaise: f.balance.dueInPaise,
        paidInPaise: f.balance.paidInPaise,
        outstandingInPaise: f.balance.outstandingInPaise,
        href: `/appointments/${f.id}`,
        action: "Collect",
      })),
      ...data.plans.map((p) => ({
        key: `plan-${p.enrollmentId}`,
        kind: "treatment_plan" as const,
        name: p.name ?? p.phone ?? "Unknown",
        // A prescribed course short of its advance is the one to chase — it
        // cannot start until the money is in.
        detail:
          p.status === "prescribed" && !p.advanceMet ? (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-3 w-3" />
              {p.planName} · {p.advancePercent}% advance short
            </span>
          ) : (
            `${p.planName} · ${p.status}`
          ),
        totalInPaise: p.totalInPaise,
        paidInPaise: p.paidInPaise,
        outstandingInPaise: p.outstandingInPaise,
        href: `/people/${p.contactId}?tab=treatment#course-${p.enrollmentId}`,
        action: "Open",
      })),
      ...data.tests.map((t) => ({
        key: `test-${t.orderId}`,
        kind: "blood_test" as const,
        name: t.name ?? t.phone ?? "Unknown",
        detail: `Ordered ${shortDate(t.orderedOn)} · ${t.status.replace(/_/g, " ")}`,
        totalInPaise: t.totalInPaise,
        paidInPaise: t.paidInPaise,
        outstandingInPaise: t.outstandingInPaise,
        href: `/people/${t.contactId}`,
        action: "Open",
      })),
      // Medicine taken on credit — collected from the patient's Billing tab.
      ...data.medicines.map((m) => ({
        key: `med-${m.id}`,
        kind: "medicine" as const,
        name: m.name ?? m.phone ?? "Unknown",
        detail: `${shortDate(m.soldAt.slice(0, 10))} · ${m.note ?? "medicine"}`,
        totalInPaise: m.totalInPaise,
        paidInPaise: m.paidInPaise,
        outstandingInPaise: m.outstandingInPaise,
        href: `/people/${m.contactId}?tab=billing`,
        action: "Collect",
      })),
    ]
  }, [data])

  const sum = (k?: Due["kind"]) => dues.filter((d) => !k || d.kind === k).reduce((n, d) => n + d.outstandingInPaise, 0)
  const n = (k: Due["kind"]) => dues.filter((d) => d.kind === k).length
  const shown = useMemo(() => (only ? dues.filter((d) => d.kind === only) : dues), [dues, only])
  const paged = usePaged(shown)

  if (loading && !data) {
    return (
      <div className={`${CARD} flex justify-center py-16`}>
        <PredictSpinner />
      </div>
    )
  }

  const filterTile = (k: "" | Due["kind"], label: string, value: number, hint: string) => (
    <button
      type="button"
      onClick={() => setOnly(k)}
      aria-pressed={only === k}
      className={`${CARD} p-3.5 text-left transition-colors hover:border-black/35 dark:hover:border-white/25 ${
        only === k ? "ring-2 ring-primary" : ""
      }`}
    >
      <p className={`text-[11px] font-semibold tracking-widest uppercase ${MUTED}`}>{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${value > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>
        {money(value)}
      </p>
      <p className={`mt-0.5 text-[11px] ${MUTED}`}>{hint}</p>
    </button>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {filterTile("", "Total due", sum(), `${dues.length} open item${dues.length === 1 ? "" : "s"}`)}
        {filterTile("consultation", "Consultation fees", sum("consultation"), `${n("consultation")} visit(s) on ${shortDate(date)}`)}
        {filterTile("treatment_plan", "Treatment plans", sum("treatment_plan"), `${n("treatment_plan")} course(s)`)}
        {filterTile("blood_test", "Blood tests", sum("blood_test"), `${n("blood_test")} order(s)`)}
        {filterTile("medicine", "Medicine", sum("medicine"), `${n("medicine")} unpaid bill(s)`)}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/12 px-4 py-3 dark:border-white/5">
          <h3 className="text-sm font-semibold">
            {only ? KIND_LABEL.get(only) : "Everything owed"}
            <span className={`ml-2 font-normal ${MUTED}`}>{shown.length}</span>
          </h3>
          <label className={`flex items-center gap-2 text-xs ${MUTED}`}>
            Visit fees for
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={CONTROL} />
          </label>
        </div>
        {shown.length === 0 ? (
          <p className={`p-8 text-center text-sm ${MUTED}`}>Nothing owed here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className={`border-b border-black/12 text-left text-xs dark:border-white/5 ${MUTED}`}>
                <tr>
                  <th className="px-4 py-2 font-medium">Patient</th>
                  <th className="px-3 py-2 font-medium">For</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Paid</th>
                  <th className="px-3 py-2 text-right font-medium">Due</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {paged.shown.map((d) => (
                  <tr key={d.key} className="border-b border-black/8 last:border-0 dark:border-white/5">
                    <td className="px-4 py-2 font-medium">{d.name}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="rounded border border-black/12 px-1.5 py-0.5 dark:border-white/10">{KIND_LABEL.get(d.kind)}</span>
                      <span className={`mt-0.5 block text-[11px] capitalize ${MUTED}`}>{d.detail}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPrice(d.totalInPaise)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${MUTED}`}>{formatPrice(d.paidInPaise)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-amber-700 dark:text-amber-400">
                      {formatPrice(d.outstandingInPaise)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link href={d.href} className={buttonVariants({ size: "sm", variant: "outline" })}>
                        {d.action}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {shown.length > 0 && <ListPagination {...paged.bar} />}
    </div>
  )
}

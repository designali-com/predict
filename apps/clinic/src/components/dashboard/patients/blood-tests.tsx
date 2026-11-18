"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, ChevronRight, FlaskConical, Plus, Receipt, Upload, X } from "lucide-react"
import { formatPrice } from "@workspace/db/treatment-plan"
import { PAYMENT_METHODS } from "@workspace/db/payment"
import { UploadReportModal } from "@/src/components/dashboard/superadmin/appointments/upload-report-modal"

interface Marker {
  id: string
  name: string
  shortCode: string
  unit: string | null
  priceInPaise: number
}

interface Order {
  id: string
  status: string
  orderedOn: string
  collectedOn: string | null
  totalInPaise: number
  paidInPaise: number
  dueInPaise: number
  note: string | null
  cancelledAt: string | null
  cancelReason: string | null
  items: { biomarkerId: string; name: string; shortCode: string; priceInPaise: number }[]
  payments: {
    id: string
    amountInPaise: number
    method: string
    receiptNo: string | null
    collectedAt: string
    voidedAt: string | null
  }[]
  reports: { id: string; fileUrl: string; fileName: string | null; uploadedAt: string }[]
  resultsIn: number
  /** The lab's booking for the sample, if any. */
  scheduledAt?: string | null
  collectionMode?: string | null
}

const INPUT =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-1.5 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

function day(value: string): string {
  return new Date(`${value}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  })
}

function stamp(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  })
}

const STATUS_LABEL: Record<string, string> = {
  ordered: "Ordered",
  collected: "Sample taken",
  reported: "Results in",
  cancelled: "Cancelled",
}

/**
 * Blood tests: ordered marker by marker, billed, and joined to their results.
 *
 * A panel is not one product. The clinic decides which markers to run and the
 * price follows from that choice, so the order carries a line per marker at the
 * price it held that day. Everything else hangs off the order: the payment that
 * settles it, the lab's sheet, and the values typed off that sheet.
 */
export function BloodTests({
  patientId,
  loginId,
  onResultsChanged,
  onEnterValues,
}: {
  /** The chart. Every patient has one; a login is optional. */
  patientId: string
  loginId?: string | null
  onResultsChanged?: () => void
  onEnterValues?: (order?: Order) => void
}) {
  const [orders, setOrders] = useState<Order[]>([])
  const [catalogue, setCatalogue] = useState<Marker[]>([])
  const [today, setToday] = useState("")
  const [loading, setLoading] = useState(true)
  const [ordering, setOrdering] = useState(false)
  const [paying, setPaying] = useState<Order | null>(null)
  const [uploading, setUploading] = useState<Order | null>(null)
  const [openOrder, setOpenOrder] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    // Failures used to be swallowed here, which left the ordering form with an
    // empty catalogue and no way to say why — it read as "no test matches
    // that", as though the 29 markers had all been searched and missed.
    try {
      const res = await fetch(`/api/staff/patients/${patientId}/blood-tests`)
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? `Could not load blood tests (HTTP ${res.status}).`)
        return
      }
      setError(null)
      setOrders(data?.orders ?? [])
      setCatalogue(data?.catalogue ?? [])
      setToday(data?.today ?? "")
    } catch {
      setError("Could not reach the server for blood tests.")
    }
  }, [patientId])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <PredictSpinner />
      </div>
    )
  }

  const outstanding = orders
    .filter((o) => !o.cancelledAt)
    .reduce((sum, o) => sum + o.dueInPaise, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="default" size="sm"
 onClick={() => setOrdering(true)}
 disabled={catalogue.length === 0}
 title={catalogue.length === 0 ? "The test catalogue did not load" : undefined}

 >
          <Plus className="h-3.5 w-3.5" />
          Order a blood test
        </Button>
        {outstanding > 0 && (
          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            {formatPrice(outstanding)} outstanding
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {orders.length === 0 ? (
        <p className="py-4 text-sm text-black/60 dark:text-white/40">
          No blood test ordered yet.
        </p>
      ) : (
        <div className="divide-y divide-black/8 dark:divide-white/5">
          {orders.map((o) => {
            const isOpen = openOrder === o.id
            return (
              <div key={o.id}>
                <Button variant="ghost" size="lg" className="w-full text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.03] h-auto justify-start whitespace-normal"
 onClick={() => setOpenOrder(isOpen ? null : o.id)}

 >
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-black/40 transition-transform dark:text-white/30 ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {o.items.length} test{o.items.length === 1 ? "" : "s"}
                      {o.items.length <= 3 && (
                        <span className="text-black/50 dark:text-white/35">
                          {" · "}
                          {o.items.map((i) => i.shortCode).join(", ")}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-black/45 dark:text-white/30">
                      {day(o.collectedOn ?? o.orderedOn)} ·{" "}
                      {o.cancelledAt ? "Cancelled" : (STATUS_LABEL[o.status] ?? o.status)}
                      {o.resultsIn > 0 && ` · ${o.resultsIn}/${o.items.length} values in`}
                      {!o.cancelledAt && o.status === "ordered" && (
                        <span className="text-sky-700 dark:text-sky-400">
                          {o.scheduledAt
                            ? ` · sample ${new Date(o.scheduledAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${o.collectionMode === "home" ? " (home)" : " (centre)"}`
                            : " · lab to book the sample"}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm whitespace-nowrap">
                    {formatPrice(o.totalInPaise)}
                    <span className="block text-[11px]">
                      {o.cancelledAt ? (
                        <span className="text-black/40 dark:text-white/25">—</span>
                      ) : o.dueInPaise === 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-400">Paid</span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400">
                          {formatPrice(o.dueInPaise)} due
                        </span>
                      )}
                    </span>
                  </span>
                </Button>

                {isOpen && (
                  <div className="space-y-3 pb-4 pl-7">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[320px] text-xs">
                        <tbody className="divide-y divide-black/8 dark:divide-white/5">
                          {o.items.map((i) => (
                            <tr key={i.biomarkerId}>
                              <td className="py-1.5">{i.name}</td>
                              <td className="py-1.5 text-right text-black/50 dark:text-white/35">
                                {i.shortCode}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {i.priceInPaise > 0 ? (
                                  formatPrice(i.priceInPaise)
                                ) : (
                                  <span className="text-black/40 dark:text-white/25">
                                    Not priced
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                          <tr className="font-semibold">
                            <td className="py-1.5" colSpan={2}>
                              Total
                            </td>
                            <td className="py-1.5 text-right tabular-nums">
                              {formatPrice(o.totalInPaise)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {o.payments.length > 0 && (
                      <div className="space-y-1">
                        {o.payments.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-2 text-xs text-black/65 dark:text-white/45"
                          >
                            <Receipt className="h-3 w-3 shrink-0" />
                            <span className={p.voidedAt ? "line-through" : ""}>
                              {formatPrice(p.amountInPaise)} · {p.method} · {stamp(p.collectedAt)}
                            </span>
                            {p.receiptNo && !p.voidedAt && (
                              <a
                                href={`/receipt/${p.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono underline"
                              >
                                {p.receiptNo}
                              </a>
                            )}
                            {p.voidedAt && <span className="text-red-600">cancelled</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {o.reports.length > 0 && (
                      <div className="space-y-1">
                        {o.reports.map((r) => (
                          <a
                            key={r.id}
                            href={r.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 text-xs underline"
                          >
                            <FlaskConical className="h-3 w-3 shrink-0" />
                            {r.fileName ?? "Lab report"}
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {!o.cancelledAt && o.dueInPaise > 0 && (
                        <Button variant="default" size="sm"
 onClick={() => setPaying(o)}

 >
                          Collect {formatPrice(o.dueInPaise)}
                        </Button>
                      )}
                      {!o.cancelledAt && (
                        <Button variant="outline" size="sm" className="hover:bg-black/5 dark:hover:bg-white/5"
 onClick={() => setUploading(o)}

 >
                          <Upload className="h-3 w-3" />
                          Upload lab report
                        </Button>
                      )}
                      {!o.cancelledAt && onEnterValues && (
                        <Button variant="outline" size="sm" className="hover:bg-black/5 dark:hover:bg-white/5"
 onClick={() => onEnterValues(o)}

 >
                          Enter values
                        </Button>
                      )}
                    </div>

                    {o.cancelReason && (
                      <p className="text-xs text-black/50 dark:text-white/35">
                        Cancelled: {o.cancelReason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {ordering && (
        <OrderDialog
          catalogue={catalogue}
          today={today}
          patientId={patientId}
          onClose={() => setOrdering(false)}
          onCreated={() => {
            setOrdering(false)
            load()
          }}
        />
      )}

      {paying && (
        <PaymentDialog
          order={paying}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null)
            load()
          }}
        />
      )}

      {uploading && (
        <UploadReportModal
          open
          reportType="final"
          patientId={loginId ?? undefined}
          chartId={patientId}
          bloodTestOrderId={uploading.id}
          onClose={() => setUploading(null)}
          onUploaded={() => {
            load()
            onResultsChanged?.()
          }}
          onEnterValues={() => {
            const ord = uploading
            setUploading(null)
            onEnterValues?.(ord)
          }}
        />
      )}
    </div>
  )
}

/** Choose the markers, see what they add up to. */
function OrderDialog({
  catalogue,
  today,
  patientId,
  onClose,
  onCreated,
}: {
  catalogue: Marker[]
  today: string
  patientId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [collectedOn, setCollectedOn] = useState("")
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosen = useMemo(() => catalogue.filter((m) => picked[m.id]), [catalogue, picked])
  const total = chosen.reduce((sum, m) => sum + m.priceInPaise, 0)
  const unpriced = chosen.filter((m) => m.priceInPaise === 0).length

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return catalogue
    return catalogue.filter(
      (m) => m.name.toLowerCase().includes(q) || m.shortCode.toLowerCase().includes(q),
    )
  }, [catalogue, query])

  async function create() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/staff/patients/${patientId}/blood-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          biomarkerIds: chosen.map((m) => m.id),
          collectedOn: collectedOn || null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not create that blood test")
        return
      }
      onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-md border border-black/18 bg-white shadow-lg dark:border-white/10 dark:bg-black">
        <div className="flex items-start justify-between gap-3 border-b border-black/12 px-4 py-3 dark:border-white/8">
          <div>
            <h2 className="text-sm font-semibold">Order a blood test</h2>
            <p className="mt-0.5 text-xs text-black/60 dark:text-white/40">
              Pick the markers to run. The bill is their sum.
            </p>
          </div>
          <Button variant="ghost" size="default" className="hover:bg-black/5 dark:hover:bg-white/5"
 onClick={onClose}

 aria-label="Close"
 >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-black/12 px-4 py-3 dark:border-white/8">
          <div>
            <label className="mb-1 block text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
              Blood drawn on
            </label>
            {/* Optional: a test is often ordered today and drawn tomorrow. */}
            <input
              type="date"
              value={collectedOn}
              max={today}
              onChange={(e) => setCollectedOn(e.target.value)}
              className={`${INPUT} max-w-[180px]`}
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
              Find a test
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="hs-CRP"
              className={INPUT}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-black/8 dark:divide-white/5">
              {shown.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-2 align-middle">
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={Boolean(picked[m.id])}
                        onChange={(e) =>
                          setPicked((p) => ({ ...p, [m.id]: e.target.checked }))
                        }
                        className="h-4 w-4 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block truncate">{m.name}</span>
                        <span className="text-[11px] text-black/45 dark:text-white/30">
                          {m.shortCode}
                          {m.unit ? ` · ${m.unit}` : ""}
                        </span>
                      </span>
                    </label>
                  </td>
                  <td className="py-2 text-right align-middle text-sm whitespace-nowrap tabular-nums">
                    {m.priceInPaise > 0 ? (
                      formatPrice(m.priceInPaise)
                    ) : (
                      <span className="text-[11px] text-black/40 dark:text-white/25">
                        Not priced
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* An empty catalogue and an unmatched search look identical on
              screen and are completely different problems. Said apart. */}
          {catalogue.length === 0 ? (
            <p className="py-6 text-center text-sm text-black/50 dark:text-white/35">
              The test catalogue did not load. Close this and reopen the tab.
            </p>
          ) : shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-black/50 dark:text-white/35">
              No test matches &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : null}
        </div>

        <div className="border-t border-black/12 px-4 py-3 dark:border-white/8">
          {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold">{formatPrice(total)}</span>
              <span className="ml-2 text-xs text-black/60 dark:text-white/40">
                {chosen.length} test{chosen.length === 1 ? "" : "s"}
                {/* Said out loud: a panel that totals zero because nobody has
                    set a price looks exactly like a free one. */}
                {unpriced > 0 && ` · ${unpriced} not priced yet`}
              </span>
            </div>
            <Button variant="default" size="sm"
 onClick={create}
 disabled={busy || chosen.length === 0}

 >
              {busy ? "Creating…" : "Create test"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Take the money, through the same ledger as every other counter payment. */
function PaymentDialog({
  order,
  onClose,
  onDone,
}: {
  order: Order
  onClose: () => void
  onDone: () => void
}) {
  const [amount, setAmount] = useState(String(order.dueInPaise / 100))
  const [method, setMethod] = useState("cash")
  const [reference, setReference] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ receiptNo: string | null; paymentId: string } | null>(null)

  async function collect() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/staff/blood-tests/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountInRupees: Number(amount),
          method,
          reference: reference || null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not record that payment")
        return
      }
      setDone({ receiptNo: data?.receiptNo ?? null, paymentId: data?.paymentId })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-md border border-black/18 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-black">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Collect for blood test</h2>
            <p className="mt-0.5 text-xs text-black/60 dark:text-white/40">
              {order.items.length} test{order.items.length === 1 ? "" : "s"} ·{" "}
              {formatPrice(order.totalInPaise)} total
            </p>
          </div>
          <Button variant="ghost" size="default" className="hover:bg-black/5 dark:hover:bg-white/5"
 onClick={onClose}

 aria-label="Close"
 >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {done ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Payment recorded.
            </p>
            <div className="flex gap-2">
              <a
                href={`/receipt/${done.paymentId}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Print receipt {done.receiptNo}
              </a>
              <Button variant="outline" size="sm" className="hover:bg-black/5 dark:hover:bg-white/5"
 onClick={onDone}

 >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
                Method
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={INPUT}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            {method !== "cash" && (
              <div>
                <label className="mb-1 block text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
                  Reference
                </label>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className={INPUT}
                />
              </div>
            )}
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <Button variant="default" size="sm" className="w-full"
 onClick={collect}
 disabled={busy}

 >
              {busy ? "Recording…" : `Collect ₹${amount}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

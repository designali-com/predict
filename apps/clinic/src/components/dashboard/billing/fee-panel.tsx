"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import { Banknote, Check, ChevronDown, Pencil, X, Printer } from "lucide-react"
import { formatPrice } from "@workspace/db/treatment-plan"
import { VoidPaymentDialog, type VoidablePayment } from "./void-payment-dialog"
import { useMe } from "@/src/lib/use-me"
import { PAYMENT_METHODS } from "@workspace/db/payment"

interface Payment {
  receiptNo?: string | null
  id: string
  kind: string
  amountInPaise: number
  method: string
  reference: string | null
  voidedAt: string | null
  voidReason: string | null
  collectedAt: string
}

interface Balance {
  dueInPaise: number
  paidInPaise: number
  outstandingInPaise: number
  settled: boolean
}

const INPUT =
  "h-8 w-full rounded-md border border-black/18 bg-white px-2 text-xs focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

const LABEL =
  "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40"

/**
 * The consultation fee for one visit.
 *
 * This is the gate. A visit with the fee outstanding does not reach a doctor —
 * so until this screen existed, nothing could: the fee could never be collected,
 * so no visit was ever payable, so the clinical side saw everything or the gate
 * had to stay off. The ledger, the rule and the enforcement were all written
 * before anything could take money.
 *
 * The amount is editable because concessions happen and the front desk should
 * not have to ask anyone. It defaults to the clinic's standing fee.
 */
export function FeePanel({
  appointmentId,
  contactId,
  onPaid,
}: {
  appointmentId: string
  contactId: string
  onPaid?: () => void
}) {
  const [balance, setBalance] = useState<Balance | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("cash")
  const [reference, setReference] = useState("")
  const [editingFee, setEditingFee] = useState(false)
  const [feeInRupees, setFeeInRupees] = useState("")

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/staff/payments?contactId=${contactId}&appointmentId=${appointmentId}`,
    )
    const data = await res.json().catch(() => null)
    setBalance(data?.consultation ?? null)
    setPayments((data?.payments ?? []).filter((p: Payment) => p.kind === "consultation"))
    // Pre-fills what is actually outstanding — the amount asked for nine times
    // out of ten, and typing it again is nine chances to type it wrong.
    if (data?.consultation?.outstandingInPaise) {
      setAmount(String(Math.round(data.consultation.outstandingInPaise / 100)))
    }
  }, [contactId, appointmentId])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const collect = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy("collect")
    setError(null)
    try {
      const res = await fetch("/api/staff/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId,
          appointmentId,
          kind: "consultation",
          amountInRupees: amount,
          method,
          reference,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not record that payment")
        return
      }
      setReference("")
      await load()
      // Collected: the card folds back to its one line, now saying Paid.
      setOpen(false)
      // Settling the fee is what opens this visit to the doctor, so the page
      // around this has to hear about it.
      onPaid?.()
    } finally {
      setBusy(null)
    }
  }

  const saveFee = async (rupees: string) => {
    setBusy("fee")
    setError(null)
    try {
      const res = await fetch("/api/staff/payments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appointmentId, feeInRupees: rupees }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not change the fee")
        return
      }
      setEditingFee(false)
      await load()
      onPaid?.()
    } finally {
      setBusy(null)
    }
  }

  // Which payment the dialog is asking about. Null when it is closed.
  const [voiding, setVoiding] = useState<VoidablePayment | null>(null)
  const me = useMe()
  // Closed by default — one line saying what is due or that it is paid.
  // Collect payment opens it with the form; a paid fee opens on Details.
  const [open, setOpen] = useState(false)

  const voidOne = async (id: string, reason: string) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/staff/payments/${id}/void`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? "Could not cancel that payment")
        return
      }
      await load()
      onPaid?.()
      setVoiding(null)
    } finally {
      setBusy(null)
    }
  }

  const voidDialog = voiding ? (
    <VoidPaymentDialog
      payment={voiding}
      busy={busy === voiding.id}
      onConfirm={(reason) => voidOne(voiding.id, reason)}
      onClose={() => setVoiding(null)}
    />
  ) : null

  // Money is the front desk's job. A doctor and a nutritionist hold no
  // billing grant, so this panel would only ever show them a fee they cannot
  // collect and a form the server would refuse. Rendered nothing while `me`
  // is still loading, so it never flashes up and disappears.
  if (!me?.permissions.includes("clinic.billing")) return null

  if (loading) {
    return (
      <div className="flex justify-center rounded-md border border-black/18 py-8 dark:border-white/10">
        <PredictSpinner className="size-5" />
      </div>
    )
  }

  const settled = balance?.settled ?? false
  const free = (balance?.dueInPaise ?? 0) === 0
  const expanded = open

  // The receipt to reach for from the collapsed row: the last one that still
  // stands. A cancelled payment has a receipt too, but it is not the one
  // somebody collapsing a paid visit is after.
  const lastPaid = [...payments]
    .filter((p) => !p.voidedAt)
    .sort((a, b) => Date.parse(b.collectedAt) - Date.parse(a.collectedAt))[0]

  return (
    <div className="rounded-md border border-black/18 bg-white dark:border-white/10 dark:bg-black">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Banknote className="h-3.5 w-3.5 shrink-0 text-black/50 dark:text-white/40" />
          <span className="text-xs font-semibold">Consultation fee</span>
          {settled ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              {free ? "Free" : `Paid ${formatPrice(balance?.paidInPaise ?? 0)}`}
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
              {formatPrice(balance?.outstandingInPaise ?? 0)} due
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {lastPaid && (
            <a
              href={`/receipt/${lastPaid.id}`}
              target="_blank"
              rel="noreferrer"
              title={lastPaid.receiptNo ? `Receipt ${lastPaid.receiptNo}` : "Print receipt"}
              aria-label="Print the receipt"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-black/15 px-2 text-[11px] text-black/70 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/5"
            >
              <Printer className="h-3 w-3" />
              Print
            </a>
          )}
          {!settled ? (
            <Button type="button" variant="simple" size="sm" className="h-7" onClick={() => setOpen((v) => !v)}>
              {open ? "Close" : "Collect payment"}
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-black/60 dark:text-white/50" onClick={() => setOpen((v) => !v)}>
              Details <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          )}
        </div>
      </div>

      {expanded && (
      <div className="grid grid-cols-3 border-t border-black/12 dark:border-white/10">
        <Figure label="Fee" value={formatPrice(balance?.dueInPaise ?? 0)} />
        <Figure label="Paid" value={formatPrice(balance?.paidInPaise ?? 0)} />
        <Figure
          label="To collect"
          value={formatPrice(balance?.outstandingInPaise ?? 0)}
          warn={!settled}
        />
      </div>
      )}

      {expanded && (
      <div className="border-t border-black/12 px-3 py-2.5 dark:border-white/5">
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {/* The fee is set before it is paid. Once settled, changing it would
          leave a paid visit owing or in credit — cancel the payment first. */}
      {!settled && (
      <div className="mt-2">
        {editingFee ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="w-32">
              <span className={LABEL}>Fee (₹)</span>
              <input
                type="number"
                min={0}
                value={feeInRupees}
                onChange={(e) => setFeeInRupees(e.target.value)}
                className={INPUT}
              />
            </label>
            <Button variant="default" size="sm" className="h-8" onClick={() => saveFee(feeInRupees)} disabled={busy === "fee"}>
              Save
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setEditingFee(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Button variant="ghost" size="sm" className="text-black/60 hover:text-black dark:text-white/40 dark:hover:text-white"
 onClick={() => {
 setFeeInRupees(String(Math.round((balance?.dueInPaise ?? 0) / 100)))
 setEditingFee(true)
 }}

 >
              <Pencil className="h-3 w-3" />
              Change the fee for this visit
            </Button>
            {!free && (balance?.paidInPaise ?? 0) === 0 && (
              <Button variant="ghost" size="sm" className="text-black/60 hover:text-black dark:text-white/40 dark:hover:text-white"
 onClick={() => saveFee("0")}
 disabled={busy === "fee"}

 >
                {busy === "fee" ? "Saving…" : "Free appointment"}
              </Button>
            )}
          </div>
        )}
      </div>
      )}

      {!settled && (
        <form onSubmit={collect} className="mt-2.5 grid items-end gap-2 sm:grid-cols-[6.5rem_7.5rem_minmax(0,1fr)_auto]">
          <label>
            <span className={LABEL}>Amount (₹)</span>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={INPUT}
              required
            />
          </label>
          <label>
            <span className={LABEL}>Method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={LABEL}>Reference</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UPI ref, slip no."
              className={INPUT}
            />
          </label>
          <Button variant="default" size="sm" className="h-8" type="submit" disabled={busy === "collect"}>
            {busy === "collect" && <PredictSpinner className="size-4" />}
            Collect
          </Button>
        </form>
      )}

      </div>
      )}

      {expanded && payments.length > 0 && (
        <div className="border-t border-black/12 px-3 py-2 dark:border-white/10">
          <Ledger payments={payments} busy={busy} onVoid={setVoiding} />
        </div>
      )}

      {voidDialog}
    </div>
  )
}

function Figure({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="border-r border-black/12 px-3 py-2 last:border-r-0 dark:border-white/10">
      <p className="text-[10px] font-medium uppercase tracking-wide text-black/45 dark:text-white/40">
        {label}
      </p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${warn ? "text-amber-700 dark:text-amber-400" : ""}`}>
        {value}
      </p>
    </div>
  )
}

/**
 * What was taken, including what was cancelled.
 *
 * Voided rows stay, struck through and with their reason — a receipt that
 * vanishes is worse than one marked cancelled, and "why is this not counted?"
 * needs an answer written at the time rather than remembered.
 */
export function Ledger({
  payments,
  busy,
  onVoid,
}: {
  payments: Payment[]
  busy: string | null
  // The whole row, not its id: the dialog shows what is being cancelled.
  onVoid: (payment: Payment) => void
}) {
  return (
    <div className="mt-2.5 overflow-x-auto rounded-md border border-black/12 dark:border-white/5">
      <table className="w-full text-xs">
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b border-black/12 last:border-0 dark:border-white/5">
              <td className={`px-2.5 py-1.5 tabular-nums ${p.voidedAt ? "line-through opacity-60" : ""}`}>
                {formatPrice(p.amountInPaise)}
              </td>
              <td className="px-2.5 py-1.5 text-xs capitalize text-black/60 dark:text-white/40">
                {p.method}
                {p.reference ? ` · ${p.reference}` : ""}
              </td>
              <td className="px-2.5 py-1.5 text-xs text-black/60 dark:text-white/40">
                {new Date(p.collectedAt).toLocaleDateString()}
              </td>
              <td className="px-2.5 py-1.5 text-right">
                <a
                  href={`/receipt/${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title={p.receiptNo ? `Receipt ${p.receiptNo}` : "Receipt"}
                  className="mr-1 inline-flex rounded p-1 text-black/60 hover:text-black dark:text-white/40 dark:hover:text-white"
                  aria-label="Open the receipt"
                >
                  <Printer className="h-3.5 w-3.5" />
                </a>
                {p.voidedAt ? (
                  <span className="text-xs text-black/60 dark:text-white/40">
                    Cancelled{p.voidReason ? ` — ${p.voidReason}` : ""}
                  </span>
                ) : (
                  <Button variant="ghost" size="default" className="text-black/60 hover:text-black dark:text-white/40 dark:hover:text-white"
 onClick={() => onVoid(p)}
 disabled={busy === p.id}

 aria-label="Cancel this payment"
 title="Cancel this payment"
 >
                    {busy === p.id ? (
                      <PredictSpinner className="size-4" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

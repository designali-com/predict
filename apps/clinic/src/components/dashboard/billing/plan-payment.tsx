"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import { Banknote, Check, Play, TriangleAlert } from "lucide-react"
import { formatPrice, SITTING_MODES } from "@workspace/db/treatment-plan"
import { PAYMENT_METHODS } from "@workspace/db/payment"
import { Ledger } from "./fee-panel"
import { VoidPaymentDialog, type VoidablePayment } from "./void-payment-dialog"

interface Payment {
  id: string
  kind: string
  enrollmentId: string | null
  amountInPaise: number
  method: string
  reference: string | null
  voidedAt: string | null
  voidReason: string | null
  collectedAt: string
}

interface PlanBalance {
  /** After the discount — what the advance is a share of. */
  packageInPaise: number
  discountInPaise?: number
  totalInPaise: number
  paidInPaise: number
  outstandingInPaise: number
  advancePercent: number
  advanceDueInPaise: number
  advanceMet: boolean
  advanceShortfallInPaise: number
  status: string
}

const INPUT =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

const LABEL =
  "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40"

function today(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Paying for a course, and starting it.
 *
 * Two things kept apart on purpose. "Is it paid off?" is what the desk chases;
 * "can it begin?" is the advance, and a patient with 30% down on a 42-day
 * course is entitled to start. Holding them until the balance cleared would be
 * the system inventing a policy the clinic does not have.
 *
 * Until this screen existed the advance could never be met, so a prescribed
 * course could never be activated — the rule was enforced against a payment
 * nobody could make.
 */
export function PlanPayment({
  enrollmentId,
  contactId,
  status,
  onChanged,
}: {
  enrollmentId: string
  contactId: string
  status: string
  onChanged: () => void
}) {
  const [balance, setBalance] = useState<PlanBalance | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("cash")
  const [reference, setReference] = useState("")
  // The money form opens only when somebody means to take money — left open,
  // a filled-in amount and a Collect button were one stray tap from a receipt.
  const [collecting, setCollecting] = useState(false)

  const [startDate, setStartDate] = useState(today())
  const [mode, setMode] = useState("in_clinic")

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/staff/payments?contactId=${contactId}&enrollmentId=${enrollmentId}`,
    )
    const data = await res.json().catch(() => null)
    setBalance(data?.plan ?? null)
    setPayments(
      (data?.payments ?? []).filter(
        (p: Payment) => p.kind === "treatment_plan" && p.enrollmentId === enrollmentId,
      ),
    )
    // Pre-fills the advance while it is short, the balance after — the amount
    // being asked for in each case.
    if (data?.plan) {
      const next = data.plan.advanceMet
        ? data.plan.outstandingInPaise
        : data.plan.advanceShortfallInPaise
      if (next > 0) setAmount(String(Math.round(next / 100)))
    }
  }, [contactId, enrollmentId])

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
          enrollmentId,
          kind: "treatment_plan",
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
      setCollecting(false)
      await load()
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const start = async () => {
    setBusy("start")
    setError(null)
    try {
      const res = await fetch("/api/staff/enrollments", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrollmentId, startDate, mode }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        // The refusal names the shortfall — it is the sentence the desk repeats
        // to the patient, so it is shown rather than replaced.
        setError(data?.error ?? "Could not start that course")
        return
      }
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  // Which payment the dialog is asking about. Null when it is closed.
  const [voiding, setVoiding] = useState<VoidablePayment | null>(null)

  const voidOne = async (id: string, reason: string) => {
    setBusy(id)
    try {
      await fetch(`/api/staff/payments/${id}/void`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      await load()
      onChanged()
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

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <PredictSpinner className="size-5" />
      </div>
    )
  }
  if (!balance) return null

  const prescribed = status === "prescribed"

  return (
    <div className="rounded-md border border-black/12 p-2.5 dark:border-white/10">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
          <Banknote className="h-3.5 w-3.5" />
          Payment
        </span>
        {balance.advancePercent > 0 && (
          <span
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
              balance.advanceMet
                ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
            }`}
          >
            {balance.advanceMet ? <Check className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
            {balance.advancePercent}% advance{" "}
            {balance.advanceMet
              ? "met"
              : `— ${formatPrice(balance.advanceShortfallInPaise)} short`}
          </span>
        )}
      </div>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Figure
          label={(balance.discountInPaise ?? 0) > 0 ? `Package (−${formatPrice(balance.discountInPaise!)})` : "Package"}
          value={formatPrice(balance.packageInPaise)}
        />
        <Figure label="Total owed" value={formatPrice(balance.totalInPaise)} />
        <Figure label="Paid" value={formatPrice(balance.paidInPaise)} />
        <Figure
          label="Outstanding"
          value={formatPrice(balance.outstandingInPaise)}
          warn={balance.outstandingInPaise > 0}
          good={balance.outstandingInPaise <= 0}
        />
      </div>

      {balance.outstandingInPaise > 0 && !collecting && (
        <div className="mt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setCollecting(true)}>
            Collect payment
          </Button>
        </div>
      )}

      {balance.outstandingInPaise > 0 && collecting && (
        <form onSubmit={collect} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="w-28">
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
          <label className="w-32">
            <span className={LABEL}>Method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[130px] flex-1">
            <span className={LABEL}>Reference</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UPI ref, slip no."
              className={INPUT}
            />
          </label>
          <Button variant="default" size="default"
 type="submit"
 disabled={busy === "collect"}

 >
            {busy === "collect" && <PredictSpinner className="size-4" />}
            Collect
          </Button>
          <Button type="button" variant="ghost" size="default" onClick={() => setCollecting(false)} disabled={busy === "collect"}>
            Cancel
          </Button>
        </form>
      )}

      {/* Starting is a separate act from paying: the advance is a floor, not
          the full price, and part payment above it is fine. */}
      {prescribed && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-black/12 pt-3 dark:border-white/5">
          {/* Only the date the course begins. Nothing is scheduled from it —
              each sitting is logged, signed, the day the patient comes. */}
          <label className="w-40">
            <span className={LABEL}>Course starts</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={INPUT}
            />
          </label>
          <Button variant="default" size="default"
 onClick={start}
 disabled={busy === "start" || !balance.advanceMet}
 title={balance.advanceMet ? undefined : "The advance has to be in first"}

 >
            {busy === "start" ? (
              <PredictSpinner className="size-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Start the course
          </Button>
          {!balance.advanceMet && (
            <span className="text-xs text-black/60 dark:text-white/40">
              {formatPrice(balance.advanceShortfallInPaise)} still to collect
            </span>
          )}
        </div>
      )}

      {payments.length > 0 && <Ledger payments={payments} busy={busy} onVoid={setVoiding} />}
      {voidDialog}
    </div>
  )
}

function Figure({ label, value, warn, good }: { label: string; value: string; warn?: boolean; good?: boolean }) {
  const tone = warn
    ? "border-amber-500/30 bg-amber-500/[0.07] text-amber-800 dark:text-amber-300"
    : good
      ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-800 dark:text-emerald-300"
      : "border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]"
  return (
    <div className={`rounded-md border px-2.5 py-1.5 ${tone}`}>
      <p className="text-[10px] font-semibold tracking-wider uppercase opacity-70">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}

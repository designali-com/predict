"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CalendarClock, CircleCheck, Package, Pill, Wallet } from "lucide-react"
import { PAYMENT_METHODS } from "@workspace/db/payment"
import { formatPrice } from "@workspace/db/treatment-plan"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"
import { RecordSection } from "@/src/components/dashboard/patients/record-ui"
import { useMe } from "@/src/lib/use-me"

const METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]))

/** Fired after anything that changes what a patient owes, so every dues box on the page re-reads. */
export const DUES_CHANGED = "predict:dues-changed"
export function duesChanged() {
  window.dispatchEvent(new Event(DUES_CHANGED))
}

interface Bill {
  id: string
  soldAt: string
  note: string | null
  grossInPaise: number
  discountInPaise: number
  totalInPaise: number
  paidInPaise: number
  outstandingInPaise: number
  lines: { name: string; quantity: number; rateInPaise: number; discountType: string | null; discountValue: number | null; discountInPaise: number; amountInPaise: number }[]
}

interface Dues {
  plans: { enrollmentId: string; planName: string; status: string; totalInPaise: number; paidInPaise: number; outstandingInPaise: number }[]
  medicines: Bill[]
  fees: { appointmentId: string; scheduledAt: string; outstandingInPaise: number }[]
  planInPaise: number
  medicineInPaise: number
  feeInPaise: number
  totalInPaise: number
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })
}

/**
 * Everything this patient owes, in one sum: what is left on their course,
 * medicine they took and have not paid for, and any visit fee still open.
 * Medicine on credit is collected right here; course money in the course's own
 * box below, visit fees on the visit.
 */
export function PatientDues({ contactId, onChanged }: { contactId: string; onChanged?: () => void }) {
  const me = useMe()
  const canCollect = me?.permissions.includes("clinic.billing") ?? false
  const [dues, setDues] = useState<Dues | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/dues?contactId=${contactId}`)
    const data = await res.json().catch(() => null)
    setDues(data?.dues ?? null)
  }, [contactId])

  useEffect(() => {
    if (!canCollect) return
    void load()
    const again = () => void load()
    window.addEventListener(DUES_CHANGED, again)
    return () => window.removeEventListener(DUES_CHANGED, again)
  }, [canCollect, load])

  if (!canCollect) return null
  if (!dues) {
    return (
      <div className="flex justify-center rounded-lg border border-border py-6">
        <PredictSpinner className="size-5" />
      </div>
    )
  }

  const changed = () => {
    duesChanged()
    onChanged?.()
  }

  return (
    <RecordSection title="What they owe" icon={Wallet}>
      {dues.totalInPaise <= 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="h-4 w-4" /> Nothing owed — courses, medicine and visit fees are all paid.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* The one number the desk asks for, then where it comes from. */}
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 sm:col-span-1">
              <p className="text-[11px] font-semibold tracking-widest text-amber-800 uppercase dark:text-amber-300">Total due</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-800 dark:text-amber-300">{formatPrice(dues.totalInPaise)}</p>
            </div>
            <Part icon={Package} label="Treatment plan" value={dues.planInPaise} hint="balance on the course" />
            <Part icon={Pill} label="Medicine" value={dues.medicineInPaise} hint={`${dues.medicines.length} unpaid bill${dues.medicines.length === 1 ? "" : "s"}`} />
            <Part icon={CalendarClock} label="Visit fees" value={dues.feeInPaise} hint={`${dues.fees.length} visit${dues.fees.length === 1 ? "" : "s"}`} />
          </div>

          {dues.plans.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {dues.plans.map((p) => (
                <li key={p.enrollmentId} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-medium">{p.planName}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {formatPrice(p.paidInPaise)} paid of {formatPrice(p.totalInPaise)} · collect in the course box below
                    </span>
                  </span>
                  <span className="font-medium tabular-nums text-amber-700 dark:text-amber-400">{formatPrice(p.outstandingInPaise)}</span>
                </li>
              ))}
            </ul>
          )}

          {dues.fees.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {dues.fees.map((f) => (
                <li key={f.appointmentId} className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/appointments/${f.appointmentId}?tab=billing`} className="hover:underline">
                    Visit fee · {day(f.scheduledAt)}
                  </Link>
                  <span className="font-medium tabular-nums text-amber-700 dark:text-amber-400">{formatPrice(f.outstandingInPaise)}</span>
                </li>
              ))}
            </ul>
          )}

          {dues.medicines.length > 0 && (
            <div className="flex flex-col gap-2">
              {dues.medicines.map((b) => (
                <MedicineBillRow key={b.id} bill={b} onChanged={async () => {
                  await load()
                  changed()
                }} />
              ))}
            </div>
          )}
        </div>
      )}
    </RecordSection>
  )
}

function Part({ icon: Icon, label, value, hint }: { icon: typeof Wallet; label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${value > 0 ? "" : "text-muted-foreground"}`}>{formatPrice(value)}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

/** One medicine bill on credit: what was taken, and collecting it — whole or part. */
function MedicineBillRow({ bill, onChanged }: { bill: Bill; onChanged: () => void }) {
  const [mode, setMode] = useState<"" | "collect" | "cancel">("")
  const [amount, setAmount] = useState(String(Math.round(bill.outstandingInPaise / 100)))
  const [method, setMethod] = useState("cash")
  const [reference, setReference] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/medicine-bills/${bill.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not do that")
        return
      }
      toast.success(done)
      if (data?.payment?.id) window.open(`/receipt/${data.payment.id}`, "_blank", "noopener")
      setMode("")
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Medicine · {day(bill.soldAt)}
          </p>
          <p className="text-xs text-muted-foreground">
            {bill.lines
              .map((l) => `${l.name} × ${l.quantity}${l.discountInPaise > 0 ? ` (${l.discountType === "percent" ? `${l.discountValue}%` : formatPrice(l.discountInPaise)} off)` : ""}`)
              .join(", ")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            Bill {formatPrice(bill.totalInPaise)}
            {bill.discountInPaise > 0 && ` (after ${formatPrice(bill.discountInPaise)} discount)`}
            {bill.paidInPaise > 0 && ` · ${formatPrice(bill.paidInPaise)} paid`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">{formatPrice(bill.outstandingInPaise)} due</span>
          {mode === "" && (
            <>
              <Button size="sm" onClick={() => setMode("collect")}>
                Collect
              </Button>
              {bill.paidInPaise === 0 && (
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setMode("cancel")}>
                  Cancel bill
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {mode === "collect" && (
        <div className="mt-3 grid items-end gap-2 border-t pt-3 sm:grid-cols-[7rem_9rem_minmax(0,1fr)_auto]">
          <div className="flex flex-col gap-1.5">
            <Label>Amount (₹)</Label>
            <Input type="number" min={1} className="h-8 text-xs" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Paid by</Label>
            <Select items={METHOD_LABELS} value={method} onValueChange={(v) => setMethod(String(v ?? "cash"))}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Reference</Label>
            <Input className="h-8 text-xs" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI or slip number" />
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setMode("")} disabled={busy}>
              Back
            </Button>
            <Button
              size="sm"
              disabled={busy || !(Number(amount) > 0)}
              onClick={() => send({ action: "pay", amountInRupees: Number(amount), method, reference }, "Payment recorded")}
            >
              {busy && <PredictSpinner className="size-4" />}
              Take {Number(amount) > 0 ? formatPrice(Math.round(Number(amount) * 100)) : ""}
            </Button>
          </div>
        </div>
      )}

      {mode === "cancel" && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
            <Label>Why cancel this bill?</Label>
            <Input className="h-8 text-xs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Entered by mistake, medicine returned…" />
          </div>
          <Button size="sm" variant="ghost" onClick={() => setMode("")} disabled={busy}>
            Back
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="text-white"
            disabled={busy || !reason.trim()}
            onClick={() => send({ action: "cancel", reason }, "Bill cancelled — medicine back on the shelf")}
          >
            Cancel bill
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}

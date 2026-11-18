"use client"

import { Button } from "@workspace/ui/components/button"

import { useEffect, useState } from "react"
import { Footprints, Printer } from "lucide-react"
import { PAYMENT_METHODS } from "@workspace/db/payment"
import { formatPrice } from "@workspace/db/treatment-plan"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Plan {
  id: string
  name: string
  limbs: string
  priceInPaise: number
}

interface Done {
  sessionNumber: number
  amountInPaise: number
  paymentId: string
  receiptNo: string | null
}

const INPUT =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

const LABEL =
  "mb-1 block text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40"

function today(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * A therapy session taken and paid for on the spot.
 *
 * For the patients who stopped taking consultations years ago and turn up when
 * they feel like it. There is no course to book a day from and no advance to
 * meet: they had the therapy, they paid, and this writes down all three things
 * that follow — the log sheet, the money, and the medicine off the shelf.
 */
export function WalkInSession({
  contactId,
  onDone,
  open: openProp,
  onOpenChange,
}: {
  contactId: string
  onDone: () => void
  /**
   * Opened from a button somewhere else (the course header's "Record a
   * session"). Given, this draws no title row or button of its own — only the
   * form while open, and the receipt line after.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [openOwn, setOpenOwn] = useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : openOwn
  const setOpen = (v: boolean) => (controlled ? onOpenChange?.(v) : setOpenOwn(v))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)

  const [planId, setPlanId] = useState("")
  const [date, setDate] = useState(today())
  const [mode, setMode] = useState("in_clinic")
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("cash")
  const [reference, setReference] = useState("")

  useEffect(() => {
    fetch("/api/staff/walk-in-therapy")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPlans(d?.plans ?? []))
      .catch(() => setPlans([]))
  }, [])

  const plan = plans.find((p) => p.id === planId)

  // The rate is filled in from the plan and stays editable — a long-standing
  // patient is exactly the person who gets charged something else.
  const choose = (id: string) => {
    setPlanId(id)
    const picked = plans.find((p) => p.id === id)
    if (picked) setAmount(String(Math.round(picked.priceInPaise / 100)))
  }

  const submit = async () => {
    // Checked here rather than with `required`: there is no form to validate
    // against, and a blank amount would otherwise post as an empty string.
    if (!planId) return setError("Pick which therapy they had.")
    if (amount === "" || Number(amount) < 0) return setError("Enter what was charged.")

    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/staff/walk-in-therapy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId,
          treatmentPlanId: planId,
          date,
          mode,
          amountInRupees: amount,
          method,
          reference,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not record that session")
        return
      }
      setDone(data)
      setOpen(false)
      setPlanId("")
      setReference("")
      onDone()
    } finally {
      setBusy(false)
    }
  }

  if (plans.length === 0) return null
  // Opened from elsewhere and nothing to show yet: nothing at all.
  if (controlled && !open && !done && !error) return null

  return (
    <div className={`rounded-md border border-black/12 px-2.5 py-1.5 dark:border-white/10 ${controlled ? "mb-2" : ""}`}>
      {!controlled && (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Footprints className="h-4 w-4 text-black/50 dark:text-white/40" />
          <span className="font-medium">Walk-in therapy</span>
          <span className="hidden text-xs text-black/45 sm:inline dark:text-white/35">one paid session, no course</span>
        </div>
        {!open && (
          <Button variant="default" size="sm"
 onClick={() => setOpen(true)}

 >
            Record a session
          </Button>
        )}
      </div>
      )}

      {done && !open && (
        <p className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
          <span>
            Session {done.sessionNumber} recorded · {formatPrice(done.amountInPaise)} taken
            {done.receiptNo ? ` · ${done.receiptNo}` : ""}
          </span>
          <a
            href={`/receipt/${done.paymentId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold underline"
          >
            <Printer className="h-3 w-3" />
            Receipt
          </a>
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="sm:col-span-2">
            <span className={LABEL}>Therapy</span>
            <select value={planId} onChange={(e) => choose(e.target.value)} className={INPUT}>
              <option value="">Pick one…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatPrice(p.priceInPaise)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className={LABEL}>Date</span>
            <input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className={INPUT}
            />
            {/* Back-dating is the normal case here: these get written up from
                the paper sheet after the fact. */}
            <span className="mt-1 block text-[11px] text-black/60 dark:text-white/40">
              The day the therapy happened.
            </span>
          </label>

          <label>
            <span className={LABEL}>Where</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={INPUT}>
              <option value="in_clinic">In clinic</option>
              <option value="at_home">At home</option>
            </select>
          </label>

          <label>
            <span className={LABEL}>Charged (₹)</span>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={INPUT}
            />
            {plan && Number(amount) !== Math.round(plan.priceInPaise / 100) && (
              <span className="mt-1 block text-[11px] text-amber-700 dark:text-amber-400">
                Rate is {formatPrice(plan.priceInPaise)}
              </span>
            )}
          </label>

          <label>
            <span className={LABEL}>Paid by</span>
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

          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <Button variant="default" size="default"
 type="button"
 onClick={submit}
 disabled={busy || !planId}

 >
              {busy && <PredictSpinner className="size-4" />}
              Record and take payment
            </Button>
            <Button variant="outline" size="default"
 type="button"
 onClick={() => setOpen(false)}

 >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

import { Button } from "@workspace/ui/components/button"

import { useEffect, useRef, useState } from "react"
import { TriangleAlert, X } from "lucide-react"
import { formatPrice } from "@workspace/db/treatment-plan"
import { PredictSpinner } from "@/src/components/predict-loader"

export interface VoidablePayment {
  id: string
  amountInPaise: number
  method: string
  receiptNo?: string | null
  collectedAt: string
}

/**
 * Cancelling a payment, asked properly.
 *
 * This was a window.prompt, which is the wrong shape for it twice over: it
 * shows the question and nothing else, so there is no way to check you are
 * cancelling the payment you meant, and it gives a one-line box for a reason
 * that ends up on a reprinted receipt.
 *
 * The amount and the receipt number are shown because they are what makes this
 * reversible-in-name-only action checkable before it happens.
 */
export function VoidPaymentDialog({
  payment,
  busy,
  onConfirm,
  onClose,
}: {
  payment: VoidablePayment
  busy: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState("")
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    box.current?.focus()
  }, [])

  // Escape closes it, the way the prompt it replaces did.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])

  const ready = reason.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cancel this payment"
        className="w-full max-w-md rounded-md border border-black/18 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-black"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Cancel this payment
          </h2>
          <Button variant="ghost" size="default" onClick={onClose} disabled={busy} aria-label="Close" >
            <X className="h-4 w-4 text-black/60 dark:text-white/40" />
          </Button>
        </div>

        {/* What is about to be cancelled, so the wrong row cannot be picked. */}
        <div className="rounded-md border border-black/12 bg-black/[0.02] p-3 dark:border-white/5 dark:bg-white/[0.03]">
          <p className="text-lg font-semibold tabular-nums">{formatPrice(payment.amountInPaise)}</p>
          <p className="mt-0.5 text-xs text-black/65 dark:text-white/45">
            {payment.receiptNo ? `Receipt ${payment.receiptNo} · ` : ""}
            <span className="capitalize">{payment.method}</span>
            {" · "}
            {new Date(payment.collectedAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>

        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
            Why is it being cancelled?
          </span>
          <textarea
            ref={box}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Entered twice, wrong patient, refunded in cash…"
            className="w-full resize-none rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"
          />
          {/* Said plainly, because it changes what the reason is for: it is not
              an internal note, it prints. */}
          <span className="mt-1 block text-[11px] text-black/60 dark:text-white/40">
            The payment is kept, struck through, with this reason against it. Its receipt still
            reprints — stamped Cancelled, carrying this line.
          </span>
        </label>

        <div className="mt-4 flex gap-2">
          <Button variant="destructive" size="default" className="text-white"
 onClick={() => ready && onConfirm(reason.trim())}
 disabled={!ready || busy}

 >
            {busy && <PredictSpinner className="size-4" />}
            Cancel the payment
          </Button>
          <Button variant="outline" size="default"
 onClick={onClose}
 disabled={busy}

 >
            Keep it
          </Button>
        </div>
      </div>
    </div>
  )
}

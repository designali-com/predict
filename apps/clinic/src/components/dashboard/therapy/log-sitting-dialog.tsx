"use client"

import { useState } from "react"
import { PenLine, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { SignaturePad } from "@/src/components/dashboard/forms/consent-block"

const INPUT =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"
const LABEL = "mb-1 block text-xs font-medium text-black/70 dark:text-white/55"

function todayInClinic(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Log a sitting: the patient was treated, and signs for it.
 *
 * This is the paper log sheet's line — one row per visit, signed. Nothing is
 * written ahead of time, so there is no day to cross out when somebody does
 * not come; the course simply has one more sitting given.
 *
 * Today by default. An earlier day writes up a sitting afterwards — from the
 * paper sheet, or an older patient's course — and then the signature is
 * optional: the patient is not here to sign for it.
 */
export function LogSittingDialog({
  enrollmentId,
  contactId,
  patientName,
  planName,
  nextNumber,
  total,
  bookingId,
  onClose,
  onLogged,
}: {
  enrollmentId: string
  contactId?: string
  patientName: string | null
  planName?: string | null
  nextNumber: number
  total: number | null
  bookingId?: string | null
  onClose: () => void
  onLogged: () => void
}) {
  const [signedName, setSignedName] = useState(patientName ?? "")
  const [signature, setSignature] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = todayInClinic()
  const [date, setDate] = useState(today)
  const backDated = date !== today
  const dayLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })

  async function save() {
    if (!signature && !backDated) {
      setError("Take the patient's signature first.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/enrollments/${enrollmentId}/sittings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId, date, signatureDataUrl: signature, signedName, note, bookingId: bookingId ?? null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not log the sitting")
        return
      }
      toast.success(backDated ? `Sitting logged for ${dayLabel}` : `Sitting ${nextNumber}${total ? ` of ${total}` : ""} logged`)
      onLogged()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (signing) {
    return (
      <SignaturePad
        name={signedName || patientName}
        onCancel={() => setSigning(false)}
        onConfirm={(url) => {
          setSignature(url)
          setSigning(false)
        }}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-md border border-border bg-background p-4 shadow-lg">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              {backDated ? "Log an earlier sitting" : `Log sitting ${nextNumber}${total ? ` of ${total}` : ""}`}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{[patientName, planName, dayLabel].filter(Boolean).join(" · ")}</p>
          </div>
          <Button variant="ghost" size="default" className="text-muted-foreground hover:text-foreground" type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-3">
          <label>
            <span className={LABEL}>Date</span>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} className={INPUT} />
            {backDated && (
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Written up for an earlier day — it takes its place among the sittings by date. Signature optional.
              </span>
            )}
          </label>
          <label>
            <span className={LABEL}>Signed by</span>
            <input value={signedName} onChange={(e) => setSignedName(e.target.value)} className={INPUT} placeholder="Patient's name" />
          </label>
          <div>
            <span className={LABEL}>Patient's signature{backDated ? " (optional)" : ""}</span>
            {signature ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signature} alt="Signature" className="h-16 max-w-[220px] rounded border border-black/10 bg-white object-contain p-1" />
                <Button type="button" size="sm" variant="outline" onClick={() => setSigning(true)}>
                  Sign again
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => setSigning(true)}>
                <PenLine className="h-4 w-4" /> Take signature
              </Button>
            )}
          </div>
          <label>
            <span className={LABEL}>Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} placeholder="e.g. knee only today" />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={busy || (!signature && !backDated)}>
              {busy ? "Saving…" : "Log sitting"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

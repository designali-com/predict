"use client"

import { Button } from "@workspace/ui/components/button"

import { useCallback, useEffect, useState } from "react"
import { X } from "lucide-react"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Doctor {
  id: string
  name: string
}

interface Slot {
  id: string
  label: string
  startIso: string
  remaining: number
}

const INPUT =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:border-ring focus:outline-none"

const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"

function today(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Booking one visit against a course — a therapy day, or a review.
 *
 * Small on purpose. The identity questions the full booking form asks are
 * already answered: this patient is on this course, so all that is left is who,
 * when, and where.
 *
 * The two cases differ in one field and it is not shown: a therapy day posts a
 * sittingId and becomes a therapy visit by being linked to it; a review posts
 * the enrolment and does NOT consume a sitting the patient paid for.
 */
export function BookVisitDialog({
  open,
  onClose,
  onBooked,
  contactId,
  title,
  subtitle,
  /** Set for a therapy day. */
  sittingId,
  /** Set for a review consultation. */
  enrollmentId,
  /** Defaults the calendar to the day the sitting was planned for. */
  suggestedDate,
  type,
}: {
  open: boolean
  onClose: () => void
  onBooked: () => void
  contactId: string
  title: string
  subtitle: string
  sittingId?: string
  enrollmentId?: string
  suggestedDate?: string
  type: "consultation" | "review"
}) {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [doctorUserId, setDoctorUserId] = useState("")
  const [date, setDate] = useState(suggestedDate ?? today())
  const [slots, setSlots] = useState<Slot[]>([])
  const [closedReason, setClosedReason] = useState<string | null>(null)
  const [startIso, setStartIso] = useState("")
  const [channel, setChannel] = useState<"in_clinic" | "virtual">("in_clinic")
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDate(suggestedDate ?? today())
    setStartIso("")
    setError(null)
  }, [open, suggestedDate])

  useEffect(() => {
    if (!open) return
    fetch("/api/staff")
      .then((res) => (res.ok ? res.json() : { staff: [] }))
      .then((data: { staff?: { id: string; name: string; role: string }[] }) =>
        setDoctors((data.staff ?? []).filter((s) => s.role?.toLowerCase() === "doctor")),
      )
      .catch(() => setDoctors([]))
  }, [open])

  const loadSlots = useCallback(async () => {
    if (!doctorUserId || !date) {
      setSlots([])
      setClosedReason(null)
      return
    }
    setLoadingSlots(true)
    try {
      const res = await fetch(
        `/api/staff/appointments/slots?date=${date}&doctorUserId=${encodeURIComponent(doctorUserId)}`,
      )
      const data = await res.json().catch(() => null)
      setSlots(data?.slots ?? [])
      setClosedReason(data?.closedReason ?? null)
    } finally {
      setLoadingSlots(false)
    }
  }, [doctorUserId, date])

  useEffect(() => {
    loadSlots()
  }, [loadSlots])

  const book = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/staff/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // Their contact IS the identity — nothing to capture, no email to
          // invent for a patient who is already on record.
          contactId,
          doctorUserId,
          type,
          startIso,
          channel,
          sittingId,
          enrollmentId,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not book that visit")
        return
      }
      onBooked()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const open_ = slots.filter((s) => s.remaining > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={book}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border border-border bg-background p-4 shadow-lg"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <Button variant="ghost" size="default" className="text-muted-foreground hover:text-foreground"
 type="button"
 onClick={onClose}
 aria-label="Close"

 >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={LABEL}>Doctor</span>
            <select
              value={doctorUserId}
              onChange={(e) => {
                setDoctorUserId(e.target.value)
                setStartIso("")
              }}
              className={INPUT}
              required
            >
              <option value="">Choose a doctor…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className={LABEL}>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                setStartIso("")
              }}
              className={INPUT}
              required
            />
          </label>

          <label className="sm:col-span-2">
            <span className={LABEL}>Where</span>
            <div className="flex gap-1.5">
              {(
                [
                  ["in_clinic", "In clinic"],
                  ["virtual", "Virtual"],
                ] as const
              ).map(([value, label]) => (
                <Button variant="ghost" size="default"
                  key={value}
                  type="button"
                  aria-pressed={channel === value}
                  onClick={() => setChannel(value)}
                  className={`h-auto justify-start whitespace-normal text-left flex-1 border px-3 py-2 text-sm font-medium transition ${
 channel === value
 ?"border-transparent bg-primary text-primary-foreground"
 :"border-border text-muted-foreground hover:border-ring"
 }`}
                >
                  {label}
                </Button>
              ))}
            </div>
          </label>
        </div>

        <div className="mt-3">
          <span className={LABEL}>Time</span>
          {loadingSlots ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <PredictSpinner className="size-4" /> Loading times…
            </div>
          ) : !doctorUserId ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
              Choose a doctor — these are their working hours.
            </p>
          ) : open_.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
              {closedReason ??
                (slots.length ? "Fully booked that day." : "No hours set for this doctor.")}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {open_.map((s) => (
                <Button variant="ghost" size="sm"
                  key={s.id}
                  type="button"
                  onClick={() => setStartIso(s.startIso)}
                  className={`border px-2 py-2 text-xs font-medium transition ${
 startIso === s.startIso
 ?"border-transparent bg-primary text-primary-foreground"
 :"border-border hover:border-ring"
 }`}
                >
                  {s.label.split(" – ")[0]}
                </Button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex items-center gap-2">
          <Button variant="default" size="default"
 type="submit"
 disabled={busy || !startIso || !doctorUserId}

 >
            {busy && <PredictSpinner className="size-4" />}
            Book
          </Button>
          <Button variant="outline" size="default"
 type="button"
 onClick={onClose}

 >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}

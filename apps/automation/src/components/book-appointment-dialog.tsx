"use client"
import { Button } from "@workspace/ui/components/button"

import { useEffect, useState } from "react"
import { CalendarPlus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Doctor {
  id: string
  name: string
}

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-2 text-sm focus:border-ring focus:outline-none"

export const APPOINTMENT_TYPES = [
  { value: "consultation", label: "Consultation" },
  { value: "review", label: "Review" },
]

export const CHANNELS = [
  { value: "in_clinic", label: "In clinic" },
  { value: "virtual", label: "Virtual" },
]

/** Local wall-clock value for a datetime-local input, never UTC. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

const EMPTY = {
  scheduledAt: "",
  type: "consultation",
  doctorUserId: "",
  channel: "in_clinic",
  notes: "",
}

export function BookAppointmentDialog({
  open,
  onOpenChange,
  contactId,
  doctors,
  onBooked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId: string
  doctors: Doctor[]
  onBooked: () => void | Promise<void>
}) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reopening should be a fresh booking, not whatever was half-typed and
  // abandoned last time.
  useEffect(() => {
    if (open) {
      setForm(EMPTY)
      setError(null)
    }
  }, [open])

  const submit = async () => {
    if (!form.scheduledAt || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId,
          scheduledAt: form.scheduledAt,
          type: form.type,
          doctorUserId: form.doctorUserId || undefined,
          channel: form.channel,
          notes: form.notes || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? "Could not book this appointment")
        toast.error(data?.error ?? "Could not book this appointment")
        return
      }
      toast.success("Appointment booked")
      await onBooked()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Book an appointment</DialogTitle>
          <DialogDescription>
            Booking moves this person to Booked and stops the automated nudges — no further Day-N
            message goes out while an appointment stands.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date & time">
            <input
              type="datetime-local"
              value={form.scheduledAt}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Doctor">
            <select
              value={form.doctorUserId}
              onChange={(e) => setForm({ ...form, doctorUserId: e.target.value })}
              className={inputClass}
            >
              <option value="">Not assigned yet</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Visit type">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className={inputClass}
            >
              {APPOINTMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Where">
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className={inputClass}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Note (optional)">
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Anything the doctor should know before the visit"
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!form.scheduledAt || saving}>
            {saving ? (
              <PredictSpinner className="size-4" />
            ) : (
              <CalendarPlus className="h-4 w-4" />
            )}
            Book appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

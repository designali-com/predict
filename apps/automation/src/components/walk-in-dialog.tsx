"use client"
import { Button } from "@workspace/ui/components/button"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { UserPlus, CheckCircle2, Info } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { toast } from "@workspace/ui/components/sonner"
import { APPOINTMENT_TYPES, CHANNELS } from "@/src/components/book-appointment-dialog"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Doctor {
  id: string
  name: string
}

interface Match {
  contactId: string
  name: string | null
  phone: string | null
  email: string | null
  stage: string
  patientCode: string | null
  firstName: string | null
  lastName: string | null
  gender: string | null
  dateOfBirth: string | null
  bloodGroup: string | null
}

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-2 text-sm focus:border-ring focus:outline-none"

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
  name: "",
  phone: "",
  email: "",
  dateOfBirth: "",
  gender: "",
  bloodGroup: "",
  scheduledAt: "",
  type: "consultation",
  doctorUserId: "",
  channel: "in_clinic",
  notes: "",
}

/**
 * Someone is standing at the counter. Take their details and book them in, in
 * one pass.
 *
 * The mobile number is looked up as it is typed, because the decision this
 * screen actually gets wrong is creating a second chart for a person the
 * clinic already knows. Recognising them mid-form — as a returning patient, or
 * as a lead the clinic has been messaging for weeks — is the difference
 * between one record and two.
 */
export function WalkInDialog({
  open,
  onOpenChange,
  doctors,
  onRegistered,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  doctors: Doctor[]
  onRegistered?: () => void | Promise<void>
}) {
  const router = useRouter()
  const [form, setForm] = useState(EMPTY)
  const [match, setMatch] = useState<Match | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ patientCode: string; isReturning: boolean } | null>(null)

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, scheduledAt: toLocalInputValue(new Date()) })
      setMatch(null)
      setError(null)
      setDone(null)
    }
  }, [open])

  const lookup = useCallback(async (phone: string) => {
    // 10 digits is the shortest thing worth asking about; below that every
    // number is a prefix of thousands and the answer is noise.
    if (phone.replace(/\D/g, "").length < 10) {
      setMatch(null)
      return
    }
    setChecking(true)
    try {
      const res = await fetch(`/api/walk-in?phone=${encodeURIComponent(phone)}`)
      const data = await res.json().catch(() => null)
      setMatch(data?.match ?? null)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => lookup(form.phone), 350)
    return () => clearTimeout(timer)
  }, [form.phone, lookup])

  // Fill from what the clinic already holds rather than asking again.
  const useMatch = () => {
    if (!match) return
    setForm((f) => ({
      ...f,
      name: match.name ?? [match.firstName, match.lastName].filter(Boolean).join(" ") ?? f.name,
      email: match.email ?? f.email,
      dateOfBirth: match.dateOfBirth ?? f.dateOfBirth,
      gender: match.gender ?? f.gender,
      bloodGroup: match.bloodGroup ?? f.bloodGroup,
    }))
  }

  const submit = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/walk-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not register this patient")
        toast.error(data?.error ?? "Could not register this patient")
        return
      }
      toast.success(data.isReturning ? "Patient booked in" : "Patient registered")
      setDone({ patientCode: data.patientCode, isReturning: data.isReturning })
      await onRegistered?.()
    } finally {
      setSaving(false)
    }
  }

  const canSubmit =
    form.name.trim() && form.phone.trim() && form.dateOfBirth && form.gender && form.scheduledAt

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                {done.isReturning ? "Booked in" : "Registered and booked"}
              </DialogTitle>
              <DialogDescription>
                {done.isReturning
                  ? "This number already had a chart, so they keep the same patient id — only the appointment is new."
                  : "New chart created."}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-border p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Patient ID
              </p>
              <p className="mt-1 font-mono text-3xl font-medium">{done.patientCode}</p>
            </div>
            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)} variant="outline">
                Close
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false)
                  router.push(`/contacts/${match?.contactId ?? ""}`)
                }}>
                Open their record
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Walk-in</DialogTitle>
              <DialogDescription>
                Take their details and book the visit in one go. The mobile number is the patient
                id — the same number always resolves to the same chart.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Patient
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Mobile number">
                    <div className="relative">
                      <input
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="98765 43210"
                        className={inputClass}
                      />
                      {checking && (
                        <PredictSpinner className="size-4" />
                      )}
                    </div>
                  </Field>
                  <Field label="Full name">
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Ankit Gaur"
                      className={inputClass}
                    />
                  </Field>
                </div>

                {match && (
                  <div className="mt-2 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                    <div className="min-w-0 flex-1">
                      <p className="text-blue-900">
                        {match.patientCode ? (
                          <>
                            Already a patient —{" "}
                            <span className="font-mono font-medium">{match.patientCode}</span>,{" "}
                            {match.name ?? "unnamed"}. Booking will reuse this id.
                          </>
                        ) : (
                          <>
                            This number is already in the CRM as{" "}
                            <span className="font-medium">{match.name ?? "an unnamed contact"}</span>{" "}
                            ({match.stage}). A chart will be created against that same record.
                          </>
                        )}
                      </p>
                      <Button
                        onClick={useMatch} size="sm" variant="ghost" className="mt-1.5 text-blue-800 underline">
                        Fill the form from what we already have
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="Date of birth">
                    <input
                      type="date"
                      value={form.dateOfBirth}
                      max={toLocalInputValue(new Date()).slice(0, 10)}
                      onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Gender">
                    <select
                      value={form.gender}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">Select…</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </Field>
                  <Field label="Blood group (optional)">
                    <input
                      value={form.bloodGroup}
                      onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
                      placeholder="O+"
                      className={inputClass}
                    />
                  </Field>
                  <div className="sm:col-span-3">
                    <Field label="Email (optional)">
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Appointment
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Date & time">
                    <input
                      type="datetime-local"
                      value={form.scheduledAt}
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
                </div>
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
                disabled={!canSubmit || saving}>
                {saving ? (
                  <PredictSpinner className="size-4" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Register &amp; book
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

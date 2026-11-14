"use client"

import { Button } from "@workspace/ui/components/button"

import { useState, useEffect } from "react"
import { X, CheckCircle2, AlertCircle } from "lucide-react"
import { CalBookingFields, type BookingChannel } from "./cal-booking-fields"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Doctor {
  id: string
  name: string
  role: string
}

interface NewAppointmentModalProps {
  open: boolean
  patientId: string
  onClose: () => void
  onSuccess: () => void
}

type Status = "idle" | "loading" | "success" | "error"

const APPOINTMENT_TYPES = [
  { value: "consultation", label: "Consultation" },
  { value: "review", label: "Review" },
] as const

export function NewAppointmentModal({
  open,
  patientId,
  onClose,
  onSuccess,
}: NewAppointmentModalProps) {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [doctorUserId, setDoctorUserId] = useState("")
  const [type, setType] = useState<(typeof APPOINTMENT_TYPES)[number]["value"]>("consultation")
  const [date, setDate] = useState<Date | undefined>()
  const [startIso, setStartIso] = useState<string | undefined>()
  const [channel, setChannel] = useState<BookingChannel | undefined>()
  const [notes, setNotes] = useState("")
  const [complimentary, setComplimentary] = useState(false)
  const [status, setStatus] = useState<Status>("idle")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    if (open) {
      setDoctorUserId("")
      setType("consultation")
      setDate(undefined)
      setStartIso(undefined)
      setChannel(undefined)
      setNotes("")
      setComplimentary(false)
      setStatus("idle")
      setErrorMsg("")

      fetch("/api/staff")
      .then((res) => (res.ok ? res.json() : { staff: [] }))
      .then((data: { staff?: { id: string; name: string; role: string }[] }) =>
        setDoctors(
          (data.staff ?? []).filter((s) => {
            const role = s.role?.toLowerCase()
            return role === "doctor" || role === "nutritionist"
          }),
        ),
      )
      .catch(() => setDoctors([]))
    }
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const canSubmit = !!startIso && !!channel

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setStatus("loading")
    setErrorMsg("")

    try {
      const res = await fetch("/api/staff/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          doctorUserId: doctorUserId || null,
          type,
          startIso,
          channel,
          notes: notes || null,
          complimentary,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to create appointment")
      }

      setStatus("success")
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 800)
    } catch (err: any) {
      setStatus("error")
      setErrorMsg(err.message || "Something went wrong")
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-black/22 bg-white text-black dark:border-white/15 dark:bg-black dark:text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex items-center justify-between border-b border-black/18 px-6 py-5 dark:border-white/10">
            <div>
              <h2 className="text-base font-semibold text-black dark:text-white">
                New Appointment
              </h2>
              <p className="mt-0.5 text-xs text-black/65 dark:text-white/45">
                Schedule a visit for this patient
              </p>
            </div>
            <Button variant="ghost" size="icon-sm"
 onClick={onClose}

 >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="relative flex flex-col gap-4 overflow-y-auto p-6"
          >
            <CalBookingFields
              doctorUserId={doctorUserId || undefined}
              date={date}
              onDateChange={setDate}
              startIso={startIso}
              onSlotChange={setStartIso}
              channel={channel}
              onChannelChange={setChannel}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-widest text-black/65 uppercase dark:text-white/45">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="w-full rounded-md border border-black/22 bg-white px-4 py-2.5 text-sm text-black outline-none transition focus:border-black/40 dark:border-white/15 dark:bg-black dark:text-white dark:focus:border-white/40"
              >
                {APPOINTMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-widest text-black/65 uppercase dark:text-white/45">
                With
              </label>
              <select
                value={doctorUserId}
                onChange={(e) => setDoctorUserId(e.target.value)}
                className="w-full rounded-md border border-black/22 bg-white px-4 py-2.5 text-sm text-black outline-none transition focus:border-black/40 dark:border-white/15 dark:bg-black dark:text-white dark:focus:border-white/40"
              >
                <option value="">Unassigned</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.role?.toLowerCase() === "nutritionist" ? `${d.name} · Nutritionist` : d.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-start gap-2 text-sm text-black dark:text-white">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={complimentary}
                onChange={(e) => setComplimentary(e.target.checked)}
              />
              <span>
                <span className="font-medium">Free appointment</span>
                <span className="mt-0.5 block text-xs text-black/60 dark:text-white/45">
                  Consultation fee becomes ₹0.
                </span>
              </span>
            </label>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-widest text-black/65 uppercase dark:text-white/45">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional"
                className="w-full resize-none rounded-md border border-black/22 bg-white px-4 py-2.5 text-sm text-black placeholder-black/50 outline-none transition focus:border-black/40 dark:border-white/15 dark:bg-black dark:text-white dark:placeholder-white/35 dark:focus:border-white/40"
              />
            </div>

            {status === "error" && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            {status === "success" && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Appointment created!
              </div>
            )}

            <Button variant="simple" size="lg" className="mt-2 w-full"
 type="submit"
 disabled={!canSubmit || status === "loading" || status === "success"}

 >
              {status === "loading" ? (
                <>
                  <PredictSpinner className="size-4" />
                  Creating…
                </>
              ) : status === "success" ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Created!
                </>
              ) : (
                "Create Appointment"
              )}
            </Button>
          </form>
        </div>
      </div>
    </>
  )
}

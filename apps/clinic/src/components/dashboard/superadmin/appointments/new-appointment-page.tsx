"use client"

import { Button } from "@workspace/ui/components/button"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AlertCircle, ArrowUpRight, CheckCircle2, Phone, Search, UserPlus, Gift, Footprints } from "lucide-react"
import { INDIAN_REGION_GROUPS } from "@workspace/db/india-regions"
import { ageFromDob } from "@workspace/db/form-scoring"
import { CalBookingFields, ChannelPicker, type BookingChannel } from "./cal-booking-fields"
import { WalkInSession } from "@/src/components/dashboard/treatment-plans/walk-in-session"
import { LogSittingDialog } from "@/src/components/dashboard/therapy/log-sitting-dialog"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Doctor {
  id: string
  name: string
  role: string
}

interface DeskAnswer {
  intent: "therapy" | "therapy_early" | "consultation"
  headline: string
  detail: string
  sitting: { id: string; dayNumber: number; mode: string; appointmentId: string | null } | null
  enrollment: { id: string; planName: string; sittings: number } | null
  nextSitting: number | null
  sittingsDone: number
  bookedToday: { id: string; hour: number } | null
  loggedToday: boolean
  reviewSuggested: boolean
}

interface LookupResult {
  phone: string
  match: "patient" | "lead" | "none"
  patient?: { id: string; name: string; email: string }
  lead?: { name: string | null; email: string | null }
  contactId?: string | null
  /** What this number is actually here for — see @workspace/db/front-desk. */
  desk?: DeskAnswer | null
  stage?: string
}

const APPOINTMENT_TYPES = [
  { value: "consultation", label: "Consultation" },
  { value: "review", label: "Review" },
] as const

// FORM-I page 1, the parts worth having while the patient is at the counter.
// Whatever is typed here is written into the registration form as a draft, so
// nothing is asked twice — keys match @workspace/db/clinical-forms.
//
// Referral is deliberately NOT here. "Who sent you" is a conversation, not
// counter work, and the printed form asks four more questions after it — who
// the referrer was, whether we treated them, when, and whether they were
// cured. Half of that on the booking screen and half on FORM-I would be one
// question in two places.

// The printed form has two boxes. The third is here because a patient who is
// neither should not have to be recorded as one of them to be seen.
const SEXES = ["Female", "Male", "LGBTQ+"]

const INPUT =
  "w-full min-w-0 max-w-full rounded-md border border-black/22 bg-white px-2.5 py-1.5 text-sm text-black placeholder-black/50 outline-none transition focus:border-black/40 dark:border-white/15 dark:bg-black dark:text-white dark:placeholder-white/35 dark:focus:border-white/40"

const LABEL =
  "mb-1 block text-xs font-medium text-black/65 dark:text-white/50"

/**
 * A labelled control, label above the input.
 *
 * The 180px label gutter this replaces cost a fifth of every row and forced the
 * whole form into a narrow centred ribbon with empty space either side.
 */
function Field({
  label,
  hint,
  span,
  required = false,
  group = false,
  children,
}: {
  label: string
  hint?: string
  /** Needed to book — marked with a red star. */
  required?: boolean
  /** How many of the section's columns to take. */
  span?: 2 | 3
  /**
   * A group of buttons, not one input: wrapped in a div, not a label. A label
   * hands every hover and click inside it to its first button, which is how
   * hovering anywhere on Sex lit up "Female".
   */
  group?: boolean
  children: React.ReactNode
}) {
  const Wrapper = group ? "div" : "label"
  return (
    <Wrapper
      className={
        `block min-w-0 ${span === 3 ? "sm:col-span-2 lg:col-span-3" : span === 2 ? "sm:col-span-2" : ""}`
      }
    >
      <span className={LABEL}>
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11px] text-black/65 dark:text-white/35">{hint}</span>
      )}
    </Wrapper>
  )
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0 rounded-lg border border-black/12 bg-white p-3 dark:border-white/10 dark:bg-black">
      <div className="mb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-[11px] text-black/55 dark:text-white/45">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

/** A row of buttons, where a three-option select would be heavier to use. */
function Choice({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = value === option
        return (
          // A plain button with its own two states — the ghost Button's own
          // hover background fought the selected colour and flickered.
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? "" : option)}
            className={`min-w-[4.5rem] flex-1 cursor-pointer whitespace-nowrap rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              on
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/22 bg-white text-black/70 hover:border-black/45 hover:bg-black/[0.04] dark:border-white/15 dark:bg-black dark:text-white/70 dark:hover:border-white/40 dark:hover:bg-white/[0.06]"
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function digitsOf(input: string): string {
  return input.replace(/\D/g, "")
}

/**
 * Book a visit, starting from the phone number.
 *
 * One screen, two columns. The details being typed sit on the left and the
 * calendar on the right, because they are used together: a number read off the
 * phone while looking at what is free. Stacked in a narrow centred column —
 * which is what this was — you scroll past the whole registration form to find
 * out there are no slots.
 *
 * A number that matches nobody is a NEW PATIENT, not an error: the details open
 * up, the booking creates the record, and nothing about it is a failure. The
 * lookup runs as the number is typed, because learning "we already have her"
 * after the name has been typed is too late to save the typing.
 */
export function NewAppointmentPage() {
  const router = useRouter()

  // ?phone= arrives from the patients page, where the desk types a number,
  // finds nobody, and is offered a booking. Retyping it here would be asking
  // the same question twice.
  const params = useSearchParams()
  const [phone, setPhone] = useState(params.get("phone") ?? "")
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [looking, setLooking] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")

  // FORM-I page 1 — captured here, finished on the visit. Address is split to
  // match patient_address rather than kept as one free-text box.
  const [sex, setSex] = useState("")
  const [dob, setDob] = useState("")
  const [age, setAge] = useState("")
  // Exact date or just the age — one field, switched like Add a patient.
  const [dobMode, setDobMode] = useState<"dob" | "age">("age")
  const [line1, setLine1] = useState("")
  const [line2, setLine2] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [pinCode, setPinCode] = useState("")

  const [doctors, setDoctors] = useState<Doctor[]>([])
  // ?doctorUserId=&date= arrive from the Schedule board, where a day was
  // clicked to book with that clinician — already chosen, not asked again.
  const [doctorUserId, setDoctorUserId] = useState(params.get("doctorUserId") ?? "")
  const [type, setType] = useState<(typeof APPOINTMENT_TYPES)[number]["value"]>("consultation")
  const [date, setDate] = useState<Date | undefined>(() => {
    const given = params.get("date")
    if (!given || !/^\d{4}-\d{2}-\d{2}$/.test(given)) return undefined
    const [y, m, d] = given.split("-").map(Number)
    return new Date(y!, m! - 1, d!)
  })
  const [startIso, setStartIso] = useState<string | undefined>()
  // Somebody standing at the desk: booked for right now, no date or time to pick.
  const [walkIn, setWalkIn] = useState(false)
  const [channel, setChannel] = useState<BookingChannel | undefined>()
  const [hostCalendarConnected, setHostCalendarConnected] = useState<boolean | null>(null)
  const [notes, setNotes] = useState("")
  const [complimentary, setComplimentary] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const phoneRef = useRef<HTMLInputElement>(null)

  // Guards against a slow reply for an old number overwriting a newer one.
  const requestSeq = useRef(0)

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    if (!doctorUserId) {
      setHostCalendarConnected(null)
      return
    }
    let cancelled = false
    fetch(`/api/staff/google-calendar?userId=${encodeURIComponent(doctorUserId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { connected?: boolean } | null) => {
        if (!cancelled) setHostCalendarConnected(data ? Boolean(data.connected) : null)
      })
      .catch(() => {
        if (!cancelled) setHostCalendarConnected(null)
      })
    return () => {
      cancelled = true
    }
  }, [doctorUserId])

  useEffect(() => {
    phoneRef.current?.focus()
    // Arriving with a number means the search has already been done once — run
    // it rather than making somebody press a key to trigger it.
    const given = params.get("phone")
    if (given && digitsOf(given).length >= 10) void runLookup(given)
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const digits = digitsOf(phone)
  const enoughDigits = digits.length >= 10

  const runLookup = useCallback(async (value: string) => {
    const seq = ++requestSeq.current
    setLooking(true)
    setLookupError(null)
    try {
      const res = await fetch(`/api/staff/appointments/lookup?phone=${encodeURIComponent(value)}`)
      const data = await res.json().catch(() => null)
      if (seq !== requestSeq.current) return

      if (!res.ok) {
        // A real failure — signed out, or the server is unhappy. Not the same
        // thing as "nobody has this number", which comes back 200.
        setLookupError(
          res.status === 401
            ? "Your session has expired — sign in again."
            : (data?.error ?? "Could not reach the server. The booking will still work."),
        )
        setLookup(null)
        return
      }

      setLookup(data)
      // Carry over what is on file so the same person is not spelled two
      // different ways across two records.
      setName((n) => n || data.patient?.name || data.lead?.name || "")
      setEmail((e) => e || data.patient?.email || data.lead?.email || "")
    } catch {
      if (seq === requestSeq.current) {
        setLookupError("Could not reach the server. The booking will still work.")
        setLookup(null)
      }
    } finally {
      if (seq === requestSeq.current) setLooking(false)
    }
  }, [])

  // Debounced, and only once the number is long enough to mean anything.
  useEffect(() => {
    if (!enoughDigits) {
      setLookup(null)
      setLookupError(null)
      return
    }
    const timer = setTimeout(() => runLookup(phone), 400)
    return () => clearTimeout(timer)
  }, [phone, enoughDigits, runLookup])

  const isPatient = lookup?.match === "patient"
  const desk = lookup?.desk ?? null
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkedIn, setCheckedIn] = useState(false)

  // A therapy day needs none of this form. It already has a patient, a date,
  // a course and a day number; the only new fact is that they walked in.
  const runLookupAgain = () => {
    if (lookup?.phone) void runLookup(lookup.phone)
  }

  // A sitting is logged, signed, the day the patient is treated — nothing is
  // dated ahead, so there is no "day" to check in against.
  const [logging, setLogging] = useState(false)
  const checkIn = () => setLogging(true)
  const canSubmit = enoughDigits && !!doctorUserId && (walkIn || (!!startIso && !!channel)) && !submitting

  const blocker = useMemo(() => {
    if (!enoughDigits) return "Enter the mobile number"
    if (!doctorUserId) return "Choose a doctor"
    if (walkIn) return null
    if (!startIso) return "Pick a date and time"
    if (!channel) return "Pick where the visit happens"
    return null
  }, [enoughDigits, doctorUserId, startIso, channel, walkIn])

  /** Everything typed here that belongs to FORM-I. */
  function registrationDraft() {
    const trimmed = name.trim()
    const space = trimmed.lastIndexOf(" ")
    return {
      first_name: space > 0 ? trimmed.slice(0, space) : trimmed,
      last_name: space > 0 ? trimmed.slice(space + 1) : "",
      phone_no: lookup?.phone ?? digits,
      sex: sex || null,
      dob: dob || null,
      address_line1: line1 || null,
      address_line2: line2 || null,
      city: city || null,
      state: state || null,
      pin_code: pinCode || null,
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)

    try {
      const identity = lookup?.patient
        ? { patientId: lookup.patient.id }
        : {
            leadName: name.trim() || undefined,
            leadPhone: lookup?.phone ?? phone,
            leadEmail: email.trim() || undefined,
          }

      const res = await fetch("/api/staff/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...identity,
          doctorUserId,
          type,
          ...(walkIn ? { walkIn: true, channel: "in_clinic" } : { startIso, channel }),
          notes: notes || null,
          complimentary,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create appointment")

      // Seed FORM-I as a draft. Best-effort: the booking is made and must not
      // be reported as failed because a convenience did not save.
      if (data.contactId) {
        await fetch("/api/staff/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: data.contactId,
            appointmentId: data.appointment.id,
            formKey: "registration_front_desk",
            answers: registrationDraft(),
          }),
        }).catch(() => {})
      }

      router.push(`/appointments/${data.appointment.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-3 p-3 text-black lg:p-4 dark:text-white"
    >
      <h1 className="page-title">New appointment</h1>

      {/* Left: who. Right: when — and the button, so the last thing chosen and
          the thing that books it sit together. Filled top to bottom. */}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
        <div className="flex min-w-0 flex-col gap-3">
        {/* ------------------------------------------------------- patient */}
        <Card title="1. Patient" subtitle="Start with the mobile number — we look it up as you type.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Mobile" required>
              <div className="relative">
                <input
                  ref={phoneRef}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  className={`${INPUT} pr-9`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {looking ? (
                    <PredictSpinner className="size-4" />
                  ) : (
                    <Search className="h-4 w-4 text-black/25 dark:text-white/25" />
                  )}
                </span>
              </div>
            </Field>

            {!isPatient && (
              <>
                <Field label="Name">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className={INPUT}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className={INPUT}
                  />
                </Field>
              </>
            )}
          </div>

          {/* Only a genuine failure is an error. Not being on file is not. */}
          {lookupError && <p className="mt-2 text-xs text-red-600">{lookupError}</p>}

          {!enoughDigits && digits.length > 0 && (
            <p className="mt-2 text-xs text-black/65 dark:text-white/40">
              {10 - digits.length} more digit{10 - digits.length === 1 ? "" : "s"}…
            </p>
          )}

          {lookup && !looking && <LookupBadge lookup={lookup} />}

          {desk && !looking && (
            <DeskAnswerBanner desk={desk} busy={checkingIn} done={checkedIn} onCheckIn={checkIn} />
          )}
          {logging && desk?.enrollment && lookup?.contactId && (
            <LogSittingDialog
              enrollmentId={desk.enrollment.id}
              contactId={lookup.contactId}
              patientName={lookup.patient?.name ?? null}
              planName={desk.enrollment.planName}
              nextNumber={desk.nextSitting ?? desk.sittingsDone + 1}
              total={desk.enrollment.sittings}
              bookingId={desk.bookedToday?.id ?? null}
              onClose={() => setLogging(false)}
              onLogged={() => {
                setCheckedIn(true)
                runLookupAgain()
              }}
            />
          )}

          {/* A patient on a course here for one session is not booking
              anything — offered beside the form, not as a visit type. See
              @workspace/db/visit-kind. Only once the number is somebody. */}
          {lookup?.contactId && !looking && (
            <div className="mt-3">
              <WalkInSession contactId={lookup.contactId} onDone={runLookupAgain} />
            </div>
          )}

          {isPatient && (
            <p className="mt-2 text-xs text-black/60 dark:text-white/40">
              Booking on their existing profile — name and email come from their record.
            </p>
          )}

          {!isPatient && (
            <>
              <div className="mt-3 grid gap-3 border-t border-black/10 pt-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] dark:border-white/10">
                <Field label="Sex" group>
                  <Choice options={SEXES} value={sex} onChange={setSex} />
                </Field>
                <div className="block min-w-0">
                  <span className={LABEL}>{dobMode === "dob" ? "Date of birth" : "Age"}</span>
                  <div className="flex min-w-0 gap-1.5">
                  {dobMode === "dob" ? (
                    <input
                      type="date"
                      value={dob}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => {
                        const next = e.target.value
                        setDob(next)
                        const years = next ? ageFromDob(next) : null
                        setAge(years === null ? "" : String(years))
                      }}
                      className={INPUT}
                    />
                  ) : (
                    <input
                      type="number"
                      min={0}
                      max={130}
                      inputMode="numeric"
                      value={age}
                      onChange={(e) => {
                        const next = e.target.value
                        setAge(next)
                        if (next.trim() === "") {
                          setDob("")
                          return
                        }
                        const years = Number(next)
                        if (!Number.isInteger(years) || years < 0 || years > 130) return
                        const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
                        const y = now.getUTCFullYear() - years
                        const m = String(now.getUTCMonth() + 1).padStart(2, "0")
                        const d = String(now.getUTCDate()).padStart(2, "0")
                        setDob(`${y}-${m}-${d}`)
                      }}
                      placeholder="Years, e.g. 45"
                      className={INPUT}
                    />
                  )}
                    <div className="flex shrink-0 overflow-hidden rounded-md border border-black/22 text-xs dark:border-white/15">
                      {(["age", "dob"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDobMode(m)}
                          className={`px-2.5 font-medium transition-colors ${
                            dobMode === m
                              ? "bg-black text-white dark:bg-white dark:text-black"
                              : "bg-white text-black/60 hover:bg-black/[0.05] dark:bg-black dark:text-white/60"
                          }`}
                        >
                          {m === "dob" ? "Date" : "Age"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {dobMode === "dob" && age && (
                    <span className="mt-1 block text-[11px] text-black/55 dark:text-white/40">{age} years</span>
                  )}
                </div>
              </div>

              {/* The address is kept out of the way until wanted. Split to
                  match patient_address: one free-text box cannot be searched
                  by city or copied onto the chart without retyping. */}
              <details className="group/addr mt-3 rounded-md border border-black/12 dark:border-white/10">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-black/70 select-none dark:text-white/60 [&::-webkit-details-marker]:hidden">
                  <span className="transition-transform group-open/addr:rotate-90">›</span>
                  Address
                  {(city || state || pinCode || line1) && (
                    <span className="truncate font-normal text-black/50 dark:text-white/40">
                      · {[line1, city, state, pinCode].filter(Boolean).join(", ")}
                    </span>
                  )}
                </summary>
                <div className="grid gap-3 border-t border-black/10 p-3 sm:grid-cols-3 dark:border-white/10">
                  <Field label="Address line 1" span={3}>
                    <input
                      value={line1}
                      onChange={(e) => setLine1(e.target.value)}
                      placeholder="House / flat, street"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Address line 2" span={3}>
                    <input
                      value={line2}
                      onChange={(e) => setLine2(e.target.value)}
                      placeholder="Area, landmark"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="City">
                    <input value={city} onChange={(e) => setCity(e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="State">
                    {/* Grouped: the two halves are alphabetical separately. */}
                    <select value={state} onChange={(e) => setState(e.target.value)} className={INPUT}>
                      <option value="">Select…</option>
                      {INDIAN_REGION_GROUPS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map((region) => (
                            <option key={region} value={region}>
                              {region}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                  <Field label="PIN code">
                    <input
                      value={pinCode}
                      onChange={(e) => setPinCode(e.target.value)}
                      inputMode="numeric"
                      maxLength={6}
                      className={INPUT}
                    />
                  </Field>
                </div>
              </details>
            </>
          )}
        </Card>

          {/* ----------------------------------------------------- visit */}
          <Card title="2. Visit">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Type">
                <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={INPUT}>
                  {APPOINTMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="With" required>
                <select
                  value={doctorUserId}
                  onChange={(e) => {
                    setDoctorUserId(e.target.value)
                    setStartIso(undefined)
                  }}
                  className={INPUT}
                >
                  <option value="">{doctors.length ? "Choose…" : "No one to choose from"}</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.role?.toLowerCase() === "nutritionist" ? `${d.name} · Nutritionist` : d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                <ChannelPicker channel={channel} onChannelChange={setChannel} />
              </div>
            </div>
            {doctors.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                No doctor or nutritionist accounts exist yet — one has to be created before a visit can be booked.
              </p>
            )}
            {channel === "virtual" && doctorUserId && hostCalendarConnected === false && (
              <p className="mt-2 text-xs text-black/70 dark:text-white/55">
                {doctors.find((d) => d.id === doctorUserId)?.name ?? "They"} connect Google Calendar once under
                Availability. After that, every virtual visit booked with them gets a Meet link.
              </p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="block min-w-0">
                <span className={LABEL}>Notes</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reason for the visit"
                  className={INPUT}
                />
              </label>
              <button
                type="button"
                aria-pressed={complimentary}
                onClick={() => setComplimentary((v) => !v)}
                className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  complimentary
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-black/22 bg-white text-black hover:border-black/45 hover:bg-black/[0.04] dark:border-white/15 dark:bg-black dark:text-white dark:hover:bg-white/[0.06]"
                }`}
              >
                <Gift className="h-4 w-4" />
                {complimentary ? "Free — ₹0" : "Free appointment"}
              </button>
            </div>
          </Card>
        </div>

        {/* ------------------------------------------------------- when */}
        <div className="min-w-0">
          <Card
            title="3. Date & time"
            subtitle={walkIn ? "Booked for right now, in the clinic." : "Times come from the doctor's own working hours."}
          >
            {/* For somebody who is already here: no slot to choose — the visit is
                today, now, and they go straight into the doctor's queue. */}
            <button
              type="button"
              aria-pressed={walkIn}
              onClick={() => setWalkIn((v) => !v)}
              className={`mb-3 flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                walkIn
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-black/22 bg-white hover:border-black/45 hover:bg-black/[0.04] dark:border-white/15 dark:bg-black dark:hover:bg-white/[0.06]"
              }`}
            >
              <Footprints className="h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Walk-in — book for now</span>
                <span className={`block text-xs ${walkIn ? "text-white/85" : "text-black/55 dark:text-white/45"}`}>
                  {walkIn
                    ? `Today, ${new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} — marked arrived, in the doctor's queue`
                    : "Patient is at the clinic now — skip the date and time"}
                </span>
              </span>
            </button>
            {!walkIn && (
            <CalBookingFields
              doctorUserId={doctorUserId || undefined}
              date={date}
              onDateChange={setDate}
              startIso={startIso}
              onSlotChange={setStartIso}
              channel={channel}
              onChannelChange={setChannel}
              hideChannel
            />
            )}
            <div className="mt-3 flex flex-col gap-2 border-t border-black/10 pt-3 dark:border-white/10">
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <Button variant="simple" size="lg" className="w-full" type="submit" disabled={!canSubmit}>
                {submitting && <PredictSpinner className="size-4" />}
                Book appointment
              </Button>
              {/* Says what is missing rather than just greying out. */}
              {blocker && !error && (
                <p className="text-center text-xs text-black/60 dark:text-white/40">{blocker}</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </form>
  )
}

/**
 * What this person is here for, and the one button that does it.
 *
 * Shown above the booking form on purpose. A patient on a course who is due
 * today does not need a form filled in — the day already exists — so the form
 * below it is the exception, not the default. Nobody has to ask them.
 */
function DeskAnswerBanner({
  desk,
  busy,
  done,
  onCheckIn,
}: {
  desk: DeskAnswer
  busy: boolean
  done: boolean
  onCheckIn: () => void
}) {
  // No course: the form below is exactly right, and a banner saying so would
  // be one more thing to read on the busiest screen in the clinic.
  if (desk.intent === "consultation" && !desk.reviewSuggested) return null

  const therapy = desk.intent === "therapy"

  if (done) {
    return (
      <p className="mt-3 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Sitting logged — {desk.enrollment?.planName}. Nothing else to fill in.
      </p>
    )
  }

  return (
    <div
      className={`mt-3 rounded-md border px-3 py-2.5 ${
        therapy
          ? "border-emerald-500/40 bg-emerald-500/[0.06]"
          : "border-black/18 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{desk.headline}</span>
          <span className="block truncate text-xs text-black/65 dark:text-white/45">
            {desk.detail}
          </span>
        </span>

        {/* Today's sitting, signed by the patient. Once it is logged there is
            nothing more to do here for them today. */}
        {therapy && desk.enrollment && !desk.loggedToday && (
          <Button variant="default" size="default" type="button" onClick={onCheckIn} disabled={busy}>
            {busy && <PredictSpinner className="size-4" />}
            Log today's sitting
          </Button>
        )}
      </div>

      {desk.reviewSuggested && (
        // A prompt, not a rule — see REVIEW_PROMPT_DAYS. Nothing is blocked by
        // ignoring it, and no review is created by it.
        <p className="mt-2 border-t border-black/10 pt-2 text-xs text-black/65 dark:border-white/10 dark:text-white/45">
          A week into the course and no review consultation yet — ask whether the doctor wants to
          see them. Book it as <strong>Review</strong> below; it does not use up a therapy day.
        </p>
      )}
    </div>
  )
}

/** What the number turned out to be. Never an error — all three are normal. */
function LookupBadge({ lookup }: { lookup: LookupResult }) {
  if (lookup.match === "patient" && lookup.patient) {
    return (
      <Link
        href={`/people/${lookup.patient.id}`}
        className="mt-3 flex items-center justify-between gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2.5 transition hover:border-emerald-500/50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{lookup.patient.name}</span>
            <span className="block truncate text-xs text-black/65 dark:text-white/45">
              Existing patient{lookup.stage ? ` · ${lookup.stage}` : ""}
            </span>
          </span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
      </Link>
    )
  }

  if (lookup.match === "lead") {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 text-xs text-amber-900 dark:text-amber-200">
        <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          We have heard from this number before
          {lookup.stage ? ` (${lookup.stage})` : ""} — no account yet. Their details are filled in
          above; the booking links to the same record.
        </span>
      </p>
    )
  }

  return (
    <p className="mt-3 flex items-start gap-2 rounded-md border border-black/18 bg-black/[0.02] px-3 py-2.5 text-xs text-black/65 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/45">
      <UserPlus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>New patient — a record is created against {lookup.phone} when the visit is booked.</span>
    </p>
  )
}

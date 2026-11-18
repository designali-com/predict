"use client"

import { Button } from "@workspace/ui/components/button"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarPlus, Footprints, Printer, Stethoscope, X } from "lucide-react"
import { PAYMENT_METHODS } from "@workspace/db/payment"
import { formatPrice } from "@workspace/db/treatment-plan"
import { INDIAN_REGION_GROUPS } from "@workspace/db/india-regions"
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
  patientCode: string | null
}

export interface StartVisitTarget {
  /** Set when the person is already in contacts. */
  contactId?: string | null
  name?: string | null
  phone?: string | null
  email?: string | null
}

const INPUT =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

const LABEL =
  "mb-1 block text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40"

function today(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * What is this person here for — a consultation, or therapy?
 *
 * The two are genuinely different acts, not two settings of one form. A
 * consultation is booked: it needs a doctor, a slot, a fee and a registration
 * form, and the patient is seen later. Therapy taken at the counter is none of
 * those — it has already happened, it is paid for now, and the only things it
 * produces are a log line, a receipt and stock coming off the shelf.
 *
 * Asked here because this is the first fork in the day and the desk had no way
 * to take the second road: a number nobody knew could only ever be booked, so
 * a first-time walk-in for therapy had to be entered as a consultation and
 * unpicked afterwards.
 */
export function StartVisitDialog({
  target,
  onClose,
  onDone,
}: {
  target: StartVisitTarget
  onClose: () => void
  onDone: () => void
}) {
  const router = useRouter()
  const [choice, setChoice] = useState<"consultation" | "therapy" | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)

  // Identity. Prefilled from whatever the roster already knows.
  const [name, setName] = useState(target.name ?? "")
  const [phone, setPhone] = useState(target.phone ?? "")
  const [email, setEmail] = useState(target.email ?? "")
  const [dob, setDob] = useState("")
  const [sex, setSex] = useState("")
  const [line1, setLine1] = useState("")
  const [line2, setLine2] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [pincode, setPincode] = useState("")

  // The session.
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])

  const known = Boolean(target.contactId)

  const pickPlan = (id: string) => {
    setPlanId(id)
    const plan = plans.find((p) => p.id === id)
    if (plan) setAmount(String(Math.round(plan.priceInPaise / 100)))
  }

  const bookConsultation = () => {
    router.push(`/appointments/new?phone=${encodeURIComponent(phone || target.phone || "")}`)
  }

  const recordTherapy = async () => {
    if (!planId) return setError("Pick which therapy they had.")
    if (!known && (!name.trim() || !phone.trim())) {
      return setError("A name and a mobile number are needed to create the patient.")
    }
    if (amount === "" || Number(amount) < 0) return setError("Enter what was charged.")

    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/staff/walk-in-therapy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: target.contactId ?? null,
          // Sent whenever there is no contact yet. The server registers them
          // in the same request that records the therapy, so a patient id is
          // never issued to somebody who then had no treatment.
          patient: known
            ? null
            : {
                name,
                phone,
                email,
                dob,
                sex,
                // Nothing picked is not "other" — OTHER is where LGBTQ+ lands,
                // and a question the counter skipped has no answer at all.
                gender:
                  sex === "Male"
                    ? "MALE"
                    : sex === "Female"
                      ? "FEMALE"
                      : sex === "LGBTQ+"
                        ? "OTHER"
                        : "UNKNOWN",
                addressLine1: line1,
                addressLine2: line2,
                city,
                state,
                pincode,
              },
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
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      {/* Centred, and capped so a tall therapy form scrolls inside the dialog
          rather than pushing it off the top of the screen. */}
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-md border border-black/18 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-black">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              {target.name ? `${target.name} — what are they here for?` : "What are they here for?"}
            </h2>
            <p className="text-xs text-black/60 dark:text-white/40">
              {known
                ? "Already in contacts. A chart and a patient id are created either way."
                : "New number. Their details are taken below and a patient id is created."}
            </p>
          </div>
          <Button variant="ghost" size="default" onClick={onClose} disabled={busy} aria-label="Close" >
            <X className="h-4 w-4 text-black/60 dark:text-white/40" />
          </Button>
        </div>

        {done ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              Session {done.sessionNumber} recorded · {formatPrice(done.amountInPaise)} taken
            </p>
            <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-200/80">
              {done.patientCode ? `Patient id ${done.patientCode} · ` : ""}
              {done.receiptNo ?? ""}
            </p>
            <div className="mt-3 flex gap-2">
              <a
                href={`/receipt/${done.paymentId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <Printer className="h-4 w-4" />
                Print the receipt
              </a>
              <Button variant="outline" size="default"
 onClick={onClose}

 >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* The fork. Two buttons rather than a dropdown: they lead to two
                different screens and one of them takes money. */}
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice
                active={choice === "consultation"}
                icon={<Stethoscope className="h-4 w-4" />}
                title="Consultation"
                onClick={() => setChoice("consultation")}
              />
              <Choice
                active={choice === "therapy"}
                icon={<Footprints className="h-4 w-4" />}
                title="Therapy session"
                onClick={() => setChoice("therapy")}
                disabled={plans.length === 0}
              />
            </div>

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

            {choice === "consultation" && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="default" size="default"
 onClick={bookConsultation}

 >
                  <CalendarPlus className="h-4 w-4" />
                  Go to booking
                </Button>
                {/* The booking screen already asks all of this, so it is not
                    asked twice here. */}
                <span className="text-xs text-black/60 dark:text-white/40">
                  The number is carried across; the rest is asked there.
                </span>
              </div>
            )}

            {choice === "therapy" && (
              <div className="mt-4 flex flex-col gap-4">
                {!known && (
                  <div>
                    <p className="mb-2 text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
                      The patient
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="sm:col-span-2">
                        <span className={LABEL}>Full name</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
                      </label>
                      <label>
                        <span className={LABEL}>Mobile</span>
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} />
                      </label>
                      <label>
                        <span className={LABEL}>Email</span>
                        <input value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
                      </label>
                      <label>
                        <span className={LABEL}>Date of birth</span>
                        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={INPUT} />
                      </label>
                      <label>
                        <span className={LABEL}>Sex</span>
                        <select value={sex} onChange={(e) => setSex(e.target.value)} className={INPUT}>
                          <option value="">—</option>
                          <option value="Female">Female</option>
                          <option value="Male">Male</option>
                          <option value="LGBTQ+">LGBTQ+</option>
                        </select>
                      </label>
                      <label className="sm:col-span-2 lg:col-span-3">
                        <span className={LABEL}>Address line 1</span>
                        <input value={line1} onChange={(e) => setLine1(e.target.value)} className={INPUT} />
                      </label>
                      <label className="sm:col-span-2 lg:col-span-3">
                        <span className={LABEL}>Address line 2</span>
                        <input value={line2} onChange={(e) => setLine2(e.target.value)} className={INPUT} />
                      </label>
                      <label>
                        <span className={LABEL}>City</span>
                        <input value={city} onChange={(e) => setCity(e.target.value)} className={INPUT} />
                      </label>
                      <label>
                        <span className={LABEL}>State</span>
                        <select value={state} onChange={(e) => setState(e.target.value)} className={INPUT}>
                          <option value="">—</option>
                          {INDIAN_REGION_GROUPS.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                              {group.options.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className={LABEL}>PIN code</span>
                        <input value={pincode} onChange={(e) => setPincode(e.target.value)} className={INPUT} />
                      </label>
                    </div>
                    {/* Said plainly: the address only lands if it is complete,
                        because every column on it is required. */}
                    <p className="mt-1 text-[11px] text-black/60 dark:text-white/40">
                      The address is saved only when line 1, city, state and PIN are all filled in.
                    </p>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
                    The session
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="sm:col-span-2">
                      <span className={LABEL}>Therapy</span>
                      <select value={planId} onChange={(e) => pickPlan(e.target.value)} className={INPUT}>
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
                      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
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
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="default" size="default"
 onClick={recordTherapy}
 disabled={busy}

 >
                    {busy && <PredictSpinner className="size-4" />}
                    Record and take payment
                  </Button>
                  <Button variant="outline" size="default"
 onClick={onClose}
 disabled={busy}

 >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Choice({
  active,
  icon,
  title,
  onClick,
  disabled,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button variant="ghost" size="default"
      onClick={onClick}
      disabled={disabled}
      className={`h-auto justify-start whitespace-normal text-left flex items-center gap-3 border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
 active
 ?"border-primary bg-primary/[0.06]"
 :"border-black/18 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
 }`}
    >
      <span className="shrink-0 text-black/65 dark:text-white/45">{icon}</span>
      <span className="text-sm font-semibold">{title}</span>
    </Button>
  )
}

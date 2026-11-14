"use client"

import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, CalendarClock, ChevronRight, Footprints, PenLine, Plus } from "lucide-react"
import {
  describePlan,
  formatPrice,
  type PlanProgress,
} from "@workspace/db/treatment-plan"
import { BillLines, type BillItem, type Billing } from "./bill-lines"
import { BookVisitDialog } from "./book-visit-dialog"
import { LogSittingDialog } from "@/src/components/dashboard/therapy/log-sitting-dialog"
import { BookSlotDialog } from "@/src/components/dashboard/therapy/book-slot-dialog"
import { dayLabel, hourLabel } from "@/src/components/dashboard/therapy/slot-grid"
import { useMe } from "@/src/lib/use-me"
import { shortPlanName } from "@/src/lib/display-name"
import { mayPrescribe } from "@workspace/db/clinical-forms"
import { WalkInSession } from "./walk-in-session"
import { PlanPayment } from "@/src/components/dashboard/billing/plan-payment"
import { DiscountEditor, DiscountField, discountBody, noDiscount, type DiscountValue } from "./discount-field"

interface Sitting {
  id: string
  dayNumber: number
  plannedDate: string
  mode: string
  status: string
  appointmentId: string | null
  completedAt: string | null
  loggedSource: string | null
  note: string | null
  signatureDataUrl?: string | null
  signedName?: string | null
  /** Given free, past the paid sittings. */
  isFree?: boolean
}

interface SlotBooking {
  id: string
  enrollmentId: string | null
  day: string
  hour: number
}

interface Enrollment {
  id: string
  planName: string
  limbs: string
  durationDays: number
  sittings: number
  priceInPaise: number
  discountInPaise?: number
  discountPercent?: number | null
  discountReason?: string | null
  isPerSession?: boolean
  /** How many of `sittings` the clinic gives free. */
  freeSittings?: number
  startDate: string
  status: string
  notes: string | null
}

interface Course {
  enrollment: Enrollment
  sittings: Sitting[]
  items: BillItem[]
  progress: PlanProgress
  billing: Billing
}

interface Plan {
  id: string
  name: string
  limbs: string
  durationDays: number
  sittings: number
  priceInPaise: number
}

/** In or out station, from the plan's name — "… — Out Station". */
function planStation(name: string): "in" | "out" {
  return /out[\s-]*station/i.test(name) ? "out" : "in"
}

/** A row of buttons, one of which is picked. */
function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | ""
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            value === o.value
              ? "border-primary bg-primary/5"
              : "border-black/18 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const inputClass =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/30 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40"

/** Today in the clinic's calendar — the same day the server reckons by. */
function today(): string {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return now.toISOString().slice(0, 10)
}

/**
 * This patient's course of treatment, and the log sheet for it.
 *
 * The log sheet is the point. A 42-day course is forty-two days that either
 * happened or did not, and half of them happen at the patient's home with the
 * medicine we sent — which is invisible unless somebody writes it down. Days
 * done in clinic are marked automatically when the visit is marked attended,
 * so the only rows anyone has to touch here are the home ones and the
 * corrections.
 *
 * Addressed by userId or contactId: a walk-in has a course and a chart long
 * before they have a login, and a panel that only accepted a user id would be
 * blank for exactly the patients who are physically in the building.
 */
export function TherapyPanel({
  userId,
  contactId,
  appointmentId,
  onChanged,
}: {
  userId?: string
  contactId?: string
  /**
   * The visit this is being prescribed at.
   *
   * Not decoration: the workflow decides a visit has been assessed by
   * looking for a course whose prescribedAtAppointmentId is this visit. A
   * plan prescribed without it belongs to the patient but to no consultation,
   * and the visit sits on "Assessed" for ever.
   */
  appointmentId?: string
  /** So the page around this can re-read the stage it just changed. */
  onChanged?: () => void
}) {
  const [courses, setCourses] = useState<Course[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [resolvedContactId, setResolvedContactId] = useState<string | null>(contactId ?? null)
  const [contactName, setContactName] = useState<string | null>(null)
  const [slots, setSlots] = useState<SlotBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState(false)
  // Adding another plan to the running course, rather than a second course.
  const [extending, setExtending] = useState(false)
  const [extendPlanId, setExtendPlanId] = useState("")
  const [extendDiscount, setExtendDiscount] = useState<DiscountValue>(noDiscount())
  // The walk-in session form, opened from the header's Record a session.
  const [recording, setRecording] = useState(false)
  const me = useMe()
  // Choosing the package is the clinical decision that ends the doctor's part
  // of the visit. The front desk sees the course — it has to, to take money for
  // it — but the server refuses a prescription from anyone else, so offering
  // the button here would only ever end in an error.
  // The doctor and the front desk — see PRESCRIBERS.
  const canPrescribe = mayPrescribe(me?.formOwners ?? [])
  // Taking money is the front desk's job, and it is a different job from
  // choosing the package — the doctor prescribes, the desk collects.
  const canCollect = me?.permissions.includes("clinic.billing") ?? false

  // A mid-course review is a consultation, so it is booked with a doctor.
  // Therapy hours are booked on the therapy calendar instead (BookSlotDialog).
  const [booking, setBooking] = useState<{ kind: "review"; enrollmentId: string; planName: string } | null>(null)

  const [station, setStation] = useState<"" | "in" | "out">("")
  const [limbs, setLimbs] = useState<"" | "two" | "four">("")
  const [planId, setPlanId] = useState("")
  const [startDate, setStartDate] = useState(today())
  const [discount, setDiscount] = useState<DiscountValue>(noDiscount())
  const [notes, setNotes] = useState("")

  const chosenPlan = plans.find((p) => p.id === planId) ?? null
  // The plans for the station and limbs picked, shortest first. A single
  // session is a clinic visit, so it sits with the in-station plans.
  const planChoices = useMemo(
    () =>
      plans
        .filter((p) => p.limbs === limbs && (planStation(p.name) === station))
        .sort((a, b) => a.durationDays - b.durationDays),
    [plans, station, limbs],
  )
  // The course running now. While there is one, the header offers to extend it.
  const runningCourse = courses.find((c) => c.enrollment.status === "active" && !c.enrollment.isPerSession) ?? null
  const extendPlan = plans.find((p) => p.id === extendPlanId) ?? null

  const query = useMemo(
    () => (contactId ? `contactId=${contactId}` : `userId=${userId}`),
    [contactId, userId],
  )

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/enrollments?${query}`)
    const data = await res.json().catch(() => null)
    setCourses(data?.enrollments ?? [])
    setResolvedContactId(data?.contactId ?? null)
    setContactName(data?.contactName ?? null)
    // Their coming hours on the therapy calendar.
    if (data?.contactId) {
      const b = await fetch(`/api/staff/therapy-calendar?contactId=${data.contactId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      setSlots(b?.bookings ?? [])
    }
  }, [query])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  // Active plans only — the picker must not offer something that has been
  // retired, and the API refuses it anyway.
  useEffect(() => {
    fetch("/api/staff/treatment-plans")
      .then((r) => r.json())
      .then((d) => setPlans(d?.plans ?? []))
      .catch(() => setPlans([]))
  }, [])

  const enrol = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy("enrol")
    setError(null)
    try {
      const res = await fetch("/api/staff/enrollments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId,
          userId,
          appointmentId,
          treatmentPlanId: planId,
          startDate,
          discount: discountBody(discount),
          notes,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not enrol this patient")
        return
      }
      setEnrolling(false)
      setStation("")
      setLimbs("")
      setPlanId("")
      setNotes("")
      setDiscount(noDiscount())
      await load()
      // Prescribing moves the visit on to the nutritionist, and the header
      // above this shows the stage.
      onChanged?.()
    } finally {
      setBusy(null)
    }
  }

  const extend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!runningCourse) return
    setBusy("extend")
    setError(null)
    try {
      const res = await fetch(`/api/staff/enrollments/${runningCourse.enrollment.id}/extend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ treatmentPlanId: extendPlanId, discount: discountBody(extendDiscount) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not extend the course")
        return
      }
      setExtending(false)
      setExtendPlanId("")
      setExtendDiscount(noDiscount())
      await load()
      onChanged?.()
    } finally {
      setBusy(null)
    }
  }

  const cancelCourse = async (course: Course) => {
    setBusy(course.enrollment.id)
    setError(null)
    try {
      await fetch(`/api/staff/enrollments/${course.enrollment.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center rounded-md border border-black/18 py-8 dark:border-white/10">
        <PredictSpinner className="size-5" />
      </div>
    )
  }

  return (
    <div className="rounded-md border border-black/18 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
          <Activity className="h-3.5 w-3.5" />
          Therapy course
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {/* A single paid session, no course — for the patient who just turns up. */}
          {canCollect && resolvedContactId && !recording && (
            <Button variant="ghost" size="sm" className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white" onClick={() => setRecording(true)}>
              <Footprints className="h-3.5 w-3.5" />
              Record a session
            </Button>
          )}
          {/* A course running: it is extended, not doubled by a second one. */}
          {runningCourse && !extending && canPrescribe && (
            <Button variant="ghost" size="sm" className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white" onClick={() => setExtending(true)}>
              <Plus className="h-3.5 w-3.5" />
              Extend the plan
            </Button>
          )}
          {!runningCourse && !enrolling && resolvedContactId && canPrescribe && (
            <Button variant="ghost" size="sm" className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
 onClick={() => setEnrolling(true)}

 >
              <Plus className="h-3.5 w-3.5" />
              Prescribe a plan
            </Button>
          )}
        </div>
      </div>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {/* Above the courses, because a walk-in has none. These are the patients
          who stopped taking consultations and turn up when they feel like it;
          for them this is the whole screen. */}
      {canCollect && resolvedContactId && (
        <WalkInSession contactId={resolvedContactId} onDone={load} open={recording} onOpenChange={setRecording} />
      )}

      {!resolvedContactId && (
        <p className="rounded-md border border-black/18 p-3 text-sm text-black/60 dark:border-white/10 dark:text-white/40">
          This person has no contact record yet, so there is nothing to enrol them against. One is
          created the first time they book an appointment or register.
        </p>
      )}

      {extending && runningCourse && canPrescribe && (
        <form onSubmit={extend} className="mb-3 rounded-md border border-black/18 p-3 dark:border-white/10">
          <p className="mb-3 text-sm">
            Extending <b>{shortPlanName(runningCourse.enrollment.planName)}</b>
            <span className="text-black/55 dark:text-white/40">
              {" "}· {runningCourse.progress.done} of {runningCourse.enrollment.sittings} sittings done
            </span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={labelClass}>Add</span>
              <select value={extendPlanId} onChange={(e) => setExtendPlanId(e.target.value)} className={inputClass} required>
                <option value="">Choose the plan to add…</option>
                {/* Same limbs first — the usual extension is more of the same. */}
                {[...plans]
                  .sort((a, b) => Number(b.limbs === runningCourse.enrollment.limbs) - Number(a.limbs === runningCourse.enrollment.limbs))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {describePlan(p)} — {formatPrice(p.priceInPaise)}
                    </option>
                  ))}
              </select>
            </label>
            {extendPlan && (
              <p className="rounded-md bg-black/[0.03] px-3 py-2 text-xs sm:col-span-2 dark:bg-white/[0.04]">
                After: <b>{runningCourse.enrollment.sittings + extendPlan.sittings} sittings</b>,{" "}
                {runningCourse.enrollment.durationDays + extendPlan.durationDays} days · bill +{formatPrice(extendPlan.priceInPaise)}
                {" "}— the same course, so the payment due and sittings left follow from it.
              </p>
            )}
            <div className="sm:col-span-2">
              <span className={labelClass}>Discount on the extension</span>
              {extendPlan ? (
                <DiscountField grossInPaise={extendPlan.priceInPaise} value={extendDiscount} onChange={setExtendDiscount} />
              ) : (
                <span className="block text-[11px] text-black/65 dark:text-white/40">Choose a plan first.</span>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="simple" size="default" type="submit" disabled={busy === "extend" || !extendPlanId}>
              {busy === "extend" && <PredictSpinner className="size-4" />}
              Extend
            </Button>
            <Button variant="outline" size="default" type="button" onClick={() => setExtending(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {enrolling && canPrescribe && (
        <form
          onSubmit={enrol}
          className="mb-3 rounded-md border border-black/18 p-3 dark:border-white/10"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Station, then limbs, then the plans that fit both — the plan's
                name already says where the sittings happen. */}
            <div className="sm:col-span-2">
              <span className={labelClass}>Patient is</span>
              <Choice
                value={station}
                options={[
                  { value: "in", label: "In station" },
                  { value: "out", label: "Out station" },
                ]}
                onChange={(v) => {
                  setStation(v)
                  setPlanId("")
                }}
              />
            </div>

            {station && (
              <div className="sm:col-span-2">
                <span className={labelClass}>Limbs</span>
                <Choice
                  value={limbs}
                  options={[
                    { value: "two", label: "Two limbs" },
                    { value: "four", label: "Four limbs" },
                  ]}
                  onChange={(v) => {
                    setLimbs(v)
                    setPlanId("")
                  }}
                />
              </div>
            )}

            {station && limbs && (
              <div className="sm:col-span-2">
                <span className={labelClass}>Plan</span>
                {planChoices.length === 0 ? (
                  <span className="block text-[11px] text-black/65 dark:text-white/40">No plan for this yet.</span>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {planChoices.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPlanId(p.id)
                          setDiscount(noDiscount())
                        }}
                        className={`rounded-md border px-3 py-2 text-left transition-colors ${
                          planId === p.id
                            ? "border-primary bg-primary/5"
                            : "border-black/18 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="block text-sm font-semibold">{p.durationDays === 1 ? "Single session" : `${p.durationDays} Day`}</span>
                        <span className="block text-[11px] text-black/65 dark:text-white/45">
                          {p.sittings === 1 ? "1 sitting" : `${p.sittings} sittings`} · {formatPrice(p.priceInPaise)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label>
              <span className={labelClass}>First sitting</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
                required
              />
            </label>

            <div className="sm:col-span-2">
              <span className={labelClass}>Discount</span>
              {chosenPlan ? (
                <DiscountField grossInPaise={chosenPlan.priceInPaise} value={discount} onChange={setDiscount} />
              ) : (
                <span className="block text-[11px] text-black/65 dark:text-white/40">Choose a plan first.</span>
              )}
            </div>

            <label className="sm:col-span-2">
              <span className={labelClass}>Notes</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the therapist should know"
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button variant="simple" size="default"
 type="submit"
 disabled={busy === "enrol" || !planId}

 >
              {busy === "enrol" && <PredictSpinner className="size-4" />}
              Prescribe
            </Button>
            <Button variant="outline" size="default"
 type="button"
 onClick={() => setEnrolling(false)}

 >
              Cancel
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-black/65 dark:text-white/40">
            Prescribing does not start anything: no sittings are scheduled and they stay a lead
            until the advance is paid and the course is started below.
          </p>
        </form>
      )}

      {courses.length === 0 && resolvedContactId && !enrolling && (
        <p className="rounded-md border border-black/18 p-3 text-sm text-black/60 dark:border-white/10 dark:text-white/40">
          Not on a course. They stay a lead until they are enrolled on one.
        </p>
      )}

      {booking && (
        <BookVisitDialog
          open
          onClose={() => setBooking(null)}
          onBooked={load}
          contactId={resolvedContactId ?? ""}
          enrollmentId={booking.enrollmentId}
          type="review"
          title="Book a review consultation"
          subtitle={`A check during ${booking.planName}. It does not use up a sitting.`}
        />
      )}

      <div className="flex flex-col gap-3">
        {courses.map((course) => (
          <CourseCard
            key={course.enrollment.id}
            course={course}
            busy={busy}
            onCancel={() => cancelCourse(course)}
            contactId={resolvedContactId ?? ""}
            contactName={contactName}
            slots={slots.filter((s) => !s.enrollmentId || s.enrollmentId === course.enrollment.id)}
            onChanged={load}
            canCollect={canCollect}
            canDiscount={canCollect || canPrescribe}
            onBookReview={() =>
              setBooking({
                kind: "review",
                enrollmentId: course.enrollment.id,
                planName: course.enrollment.planName,
              })
            }
          />
        ))}
      </div>
    </div>
  )
}

function CourseCard({
  course,
  busy,
  onCancel,
  onBookReview,
  contactId,
  contactName,
  slots,
  onChanged,
  canCollect,
  canDiscount,
}: {
  course: Course
  busy: string | null
  onCancel: () => void
  onBookReview: () => void
  contactId: string
  contactName: string | null
  /** This patient's coming hours on the therapy calendar. */
  slots: SlotBooking[]
  onChanged: () => void
  /** Whether this account takes money. The box is hidden from everyone else. */
  canCollect: boolean
  /** The doctor and the desk can give or change a discount. */
  canDiscount: boolean
}) {
  const { enrollment, sittings, items, progress, billing } = course
  const [logging, setLogging] = useState(false)
  const [booking, setBooking] = useState(false)
  const [showBill, setShowBill] = useState(false)
  // Giving free sittings: how many, and why.
  const [giving, setGiving] = useState(false)
  const [freeCount, setFreeCount] = useState("1")
  const [freeReason, setFreeReason] = useState("")
  const [freeBusy, setFreeBusy] = useState(false)
  const free = enrollment.freeSittings ?? 0
  const giveFree = async () => {
    setFreeBusy(true)
    const res = await fetch(`/api/staff/enrollments/${enrollment.id}/free-sittings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: Number(freeCount), reason: freeReason }),
    })
    const data = await res.json().catch(() => null)
    setFreeBusy(false)
    if (!res.ok) {
      toast.error(data?.error ?? "Could not add free sittings")
      return
    }
    toast.success(`${freeCount} free sitting${freeCount === "1" ? "" : "s"} added`)
    setGiving(false)
    setFreeCount("1")
    setFreeReason("")
    onChanged()
  }
  // Only what happened is listed — a sitting is written when the patient comes.
  const given = sittings.filter((s) => s.status === "done")
  const last = given[given.length - 1] ?? null
  const remaining = Math.max(0, progress.total - progress.done)
  const running = enrollment.status === "active"
  // Closed by default — one line per course. A link straight to this course
  // (#course-<id>, as the dashboard's "plans to collect" uses) opens it.
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (window.location.hash === `#course-${enrollment.id}`) setOpen(true)
  }, [enrollment.id])
  const cancelSlot = async (id: string) => {
    await fetch("/api/staff/therapy-calendar", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingId: id, status: "cancelled" }),
    })
    onChanged()
  }

  return (
    <div
      id={`course-${enrollment.id}`}
      // scroll-mt keeps the card clear of the sticky header when a link lands
      // on it; without it the heading sits under the bar and looks skipped.
      className="scroll-mt-24 rounded-md border border-black/18 p-2.5 target:border-primary dark:border-white/10"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight className={`h-4 w-4 shrink-0 text-black/45 transition-transform dark:text-white/40 ${open ? "rotate-90" : ""}`} />
        <div className="min-w-0">
          {/* The plan once, short — "4L · 21 Day" — with where it is given
              and its state beside it; the line under says only what the name does not. */}
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold" title={enrollment.planName}>
            {shortPlanName(enrollment.planName)}
            <span className="rounded bg-black/5 px-1.5 py-0.5 text-[11px] font-medium text-black/60 dark:bg-white/10 dark:text-white/60">
              {/out[\s-]*station/i.test(enrollment.planName) ? "Out station" : "In station"}
            </span>
            <StatusChip status={enrollment.status} />
          </p>
          <p className="text-xs text-black/55 dark:text-white/40">
            {enrollment.sittings - free} {enrollment.sittings - free === 1 ? "sitting" : "sittings"}
            {free > 0 && <span className="font-medium text-emerald-700 dark:text-emerald-400"> + {free} free</span>}
            {enrollment.startDate ? ` · from ${recordDay(enrollment.startDate)}` : " · not started"}
            {enrollment.startDate && <span className="font-medium text-black/70 dark:text-white/60"> · {progress.done} / {progress.total} done</span>}
          </p>
        </div>
        </button>
        {open && (
        <div className="flex flex-wrap items-center gap-1.5">
          {running && remaining > 0 && (
            <Button size="sm" onClick={() => setLogging(true)}>
              <PenLine className="h-3.5 w-3.5" /> Log today's sitting
            </Button>
          )}
          {running && remaining > 0 && (
            <Button size="sm" variant="outline" onClick={() => setBooking(true)}>
              <CalendarClock className="h-3.5 w-3.5" /> Book a slot
            </Button>
          )}
          {/* A review does NOT consume a sitting — it is a check on how the
              course is going, not one of the days that were paid for. */}
          {enrollment.status === "active" && (
            <Button variant="ghost" size="sm" className="text-black/60 hover:text-black dark:text-white/50 dark:hover:text-white"
 onClick={onBookReview}

 >
              Book review
            </Button>
          )}
          {/* Clinic treatments at no charge, on top of the plan's — no medicine taken for them. */}
          {canDiscount && !enrollment.isPerSession && enrollment.status !== "cancelled" && !giving && (
            <Button variant="ghost" size="sm" className="text-black/60 hover:text-black dark:text-white/50 dark:hover:text-white" onClick={() => setGiving(true)}>
              <Plus className="h-3.5 w-3.5" /> Free sitting
            </Button>
          )}
          {enrollment.status === "active" && (
            <Button variant="ghost" size="sm" className="text-black/60 hover:text-black dark:text-white/40 dark:hover:text-white"
 onClick={onCancel}
 disabled={busy === enrollment.id}

 >
              Stop course
            </Button>
          )}
        </div>
        )}
      </div>

      {open && (
      <>

      {giving && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.04] p-2.5">
          <label>
            <span className="mb-1 block text-[11px] font-medium text-black/60 dark:text-white/45">Free sittings</span>
            <input type="number" min={1} value={freeCount} onChange={(e) => setFreeCount(e.target.value)} className="h-8 w-20 rounded-md border border-black/18 bg-white px-2 text-sm dark:border-white/10 dark:bg-black" />
          </label>
          <label className="min-w-40 flex-1">
            <span className="mb-1 block text-[11px] font-medium text-black/60 dark:text-white/45">Reason (optional)</span>
            <input value={freeReason} onChange={(e) => setFreeReason(e.target.value)} placeholder="Out-station extra treatments, pain flare…" className="h-8 w-full rounded-md border border-black/18 bg-white px-2 text-sm dark:border-white/10 dark:bg-black" />
          </label>
          <Button size="sm" className="h-8" disabled={freeBusy || !(Number(freeCount) >= 1)} onClick={giveFree}>
            {freeBusy && <PredictSpinner className="size-4" />} Add free
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setGiving(false)}>
            Cancel
          </Button>
          <p className="basis-full text-[11px] text-black/55 dark:text-white/40">No charge and no medicine for these — sell any medicine separately.</p>
        </div>
      )}

      {/* Where the course stands: three small figures, the bar under them. */}
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <CourseFigure label="Done" value={`${progress.done} / ${progress.total}`} tone={progress.done >= progress.total && progress.total > 0 ? "good" : undefined} />
        <CourseFigure label="Left" value={String(remaining)} />
        <CourseFigure
          label="Last sitting"
          value={last ? (last.completedAt ? recordDay(last.completedAt) : last.plannedDate) : enrollment.status === "prescribed" ? "Not started" : "None yet"}
          muted={!last}
        />
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/10">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(progress.completion * 100)}%` }} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs empty:hidden">
        {slots.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1 rounded bg-primary/[0.08] px-1.5 py-0.5">
            <CalendarClock className="h-3 w-3" />
            {dayLabel(s.day)}, {hourLabel(s.hour)}
            <button type="button" onClick={() => void cancelSlot(s.id)} className="ml-0.5 text-black/40 hover:text-red-600 dark:text-white/40" title="Cancel this booking" aria-label="Cancel this booking">
              ×
            </button>
          </span>
        ))}
        {enrollment.notes && <span className="basis-full text-black/50 dark:text-white/35">{enrollment.notes}</span>}
      </div>

      <button
        type="button"
        onClick={() => setShowBill((b) => !b)}
        className="mt-2 flex w-full items-center gap-1.5 rounded-md bg-black/[0.03] px-2 py-1.5 text-left text-xs hover:bg-black/[0.05] dark:bg-white/[0.04]"
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showBill ? "rotate-90" : ""}`} />
        <span className="font-medium">Bill</span>
        <span className="tabular-nums">{formatPrice(billing.packageInPaise)}</span>
        {(billing.discountInPaise ?? 0) > 0 && <span className="text-emerald-700 dark:text-emerald-400">after {formatPrice(billing.discountInPaise!)} off</span>}
        <span className="ml-auto text-black/45 dark:text-white/35">{items.length} items</span>
      </button>
      {showBill && <BillLines items={items} billing={billing} />}
      {showBill && !enrollment.isPerSession && enrollment.status !== "cancelled" && (
        <div className="mt-2">
          <DiscountEditor
            enrollmentId={enrollment.id}
            grossInPaise={billing.grossInPaise ?? billing.packageInPaise}
            discountInPaise={billing.discountInPaise ?? 0}
            discountPercent={billing.discountPercent ?? null}
            discountReason={enrollment.discountReason ?? null}
            canEdit={canDiscount}
            onSaved={onChanged}
          />
        </div>
      )}

      {/* The log sheet: one row per visit, signed by the patient. Nothing is
          dated ahead, so there is nothing to cross out for a Sunday, a festival
          or a day they did not come. */}
      <div className="mt-2 overflow-x-auto">
        {given.length === 0 ? (
          <p className="px-1 py-1 text-xs text-black/45 dark:text-white/35">No sitting logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-black/18 text-left text-xs text-black/60 dark:border-white/10 dark:text-white/40">
              <tr>
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">Date</th>
                <th className="py-1.5 pr-2 font-medium">Signature</th>
                <th className="py-1.5 pr-2 font-medium">Logged</th>
                <th className="py-1.5 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {given.map((s, i) => (
                <tr key={s.id} className="border-b border-black/12 last:border-0 dark:border-white/5">
                  <td className="py-1.5 pr-2 font-medium">
                    {i + 1}
                    {s.isFree && <span className="ml-1 rounded bg-emerald-500/15 px-1 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">Free</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-xs text-black/65 dark:text-white/45">
                    {s.completedAt ? recordDayTime(s.completedAt) : s.plannedDate}
                  </td>
                  <td className="py-1.5 pr-2">
                    {s.signatureDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.signatureDataUrl} alt={`Signed by ${s.signedName ?? "patient"}`} title={s.signedName ?? undefined} className="h-8 max-w-[120px] rounded bg-white object-contain" />
                    ) : (
                      <span className="text-xs text-black/40 dark:text-white/30">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-xs text-black/60 dark:text-white/40">
                    {s.loggedSource === "patient" ? "By patient" : s.loggedSource === "staff" ? "By staff" : "—"}
                  </td>
                  <td className="py-1.5 text-xs text-black/60 dark:text-white/40">{s.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}

      {logging && (
        <LogSittingDialog
          enrollmentId={enrollment.id}
          contactId={contactId}
          patientName={contactName}
          planName={enrollment.planName}
          nextNumber={progress.done + 1}
          total={enrollment.isPerSession ? null : progress.total}
          // Their booking today, if they have one, becomes "attended".
          bookingId={slots.find((s) => s.day === today())?.id ?? null}
          onClose={() => setLogging(false)}
          onLogged={onChanged}
        />
      )}
      {booking && (
        <BookSlotDialog
          contactId={contactId}
          enrollmentId={enrollment.id}
          patientName={contactName}
          onClose={() => setBooking(false)}
          onBooked={onChanged}
        />
      )}

      {/* Where the plan is actually paid for.

          This component existed and was imported here, and never rendered —
          so a course could be prescribed and there was nowhere in the app to
          take money for it. The desk followed a link from the dashboard,
          landed on the patient, and found only what they owed. */}
      {canCollect && (
        <div className="mt-2">
          <PlanPayment
            enrollmentId={enrollment.id}
            contactId={contactId}
            status={enrollment.status}
            onChanged={onChanged}
          />
        </div>
      )}
    </div>
  )
}

function recordDay(iso: string): string {
  return new Date(iso.endsWith("Z") ? iso : `${iso}Z`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })
}

function recordDayTime(iso: string): string {
  return new Date(iso.endsWith("Z") ? iso : `${iso}Z`).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-md border border-black/18 px-2.5 py-2 dark:border-white/10">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
        {label}
      </p>
      <p
        className={`text-lg font-medium ${
          tone === "warn" ? "text-amber-700 dark:text-amber-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const style =
    status === "active"
      ? "bg-green-100 text-green-700"
      : status === "completed"
        ? "bg-blue-100 text-blue-700"
        : "bg-black/5 text-black/60 dark:bg-white/10 dark:text-white/60"
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${style}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
}

/**
 * Clicking the mark that is already set clears it back to pending, so a
 * mis-click is undone by clicking the same button again rather than by
 * hunting for a third "unset" control.
 */
function MarkButton({
  active,
  tone,
  label,
  onClick,
  children,
}: {
  active: boolean
  tone: "done" | "missed"
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  const on =
    tone === "done"
      ? "bg-green-600 text-white"
      : "bg-red-600 text-white"
  return (
    <Button variant="ghost" size="default"
      onClick={onClick}
      title={active ? `${label} — click to clear` : label}
      aria-label={label}
      aria-pressed={active}
      className={`p-1 transition ${
 active
 ? on
 :"border border-black/18 text-black/65 hover:text-black dark:border-white/10 dark:text-white/40 dark:hover:text-white"
 }`}
    >
      {children}
    </Button>
  )
}

/** One of the course's three figures — the same size and weight for each. */
function CourseFigure({ label, value, tone, muted }: { label: string; value: string; tone?: "good"; muted?: boolean }) {
  return (
    <div className="rounded-md border border-black/12 px-2.5 py-1.5 dark:border-white/10">
      <p className="text-[10px] font-semibold tracking-widest text-black/50 uppercase dark:text-white/40">{label}</p>
      <p
        className={`text-sm font-semibold tabular-nums ${
          tone === "good" ? "text-emerald-700 dark:text-emerald-400" : muted ? "text-black/45 dark:text-white/35" : ""
        }`}
      >
        {value}
      </p>
    </div>
  )
}

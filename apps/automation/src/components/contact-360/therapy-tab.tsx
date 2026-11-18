"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import { Check, Home, Hospital, Plus, X } from "lucide-react"
import {
  describePlan,
  formatPrice,
  SITTING_MODES,
  type PlanProgress,
} from "@workspace/db/treatment-plan"
import { Bill, type BillItem, type Billing } from "./bill"
import { toast } from "@workspace/ui/components/sonner"

interface Sitting {
  id: string
  dayNumber: number
  plannedDate: string
  mode: string
  status: string
  loggedSource: string | null
  note: string | null
}

interface Enrollment {
  id: string
  planName: string
  limbs: string
  durationDays: number
  sittings: number
  priceInPaise: number
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

const fieldClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:border-ring focus:outline-none"

const labelClass = "mb-1 block text-xs font-medium text-muted-foreground"

function today(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * The course this person is on, and whether each day of it happened.
 *
 * Enrolling from here is deliberate. This console is where the lead desk works,
 * and selling the course is the act that converts a lead — the same person who
 * chased them books them onto it, without changing screens or waiting for the
 * clinic panel to catch up. It is also the only place an offline patient's log
 * sheet is reachable at all: they have a contact and a chart, and often no
 * login for the clinic panel to key on.
 */
export function TherapyTab({ contactId, onChanged }: { contactId: string; onChanged?: () => void }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState(false)

  const [planId, setPlanId] = useState("")
  const [startDate, setStartDate] = useState(today())
  const [mode, setMode] = useState("in_clinic")
  const [priceInRupees, setPriceInRupees] = useState("")
  const [notes, setNotes] = useState("")

  const [extraFor, setExtraFor] = useState<string | null>(null)
  const [extra, setExtra] = useState({ name: "", rateInRupees: "", quantity: "1" })

  const load = useCallback(async () => {
    const res = await fetch(`/api/contacts/${contactId}/therapy`)
    const data = await res.json().catch(() => null)
    setCourses(data?.courses ?? [])
    setPlans(data?.plans ?? [])
  }, [contactId])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const enrol = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy("enrol")
    setError(null)
    try {
      const res = await fetch(`/api/contacts/${contactId}/therapy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ treatmentPlanId: planId, startDate, mode, priceInRupees, notes }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not enrol this patient")
        toast.error(data?.error ?? "Could not enrol this patient")
        return
      }
      toast.success("Patient enrolled")
      setEnrolling(false)
      setPlanId("")
      setPriceInRupees("")
      setNotes("")
      await load()
      // The header stage chip above changes to PATIENT on the first course, so
      // the page around this tab has to reload too.
      onChanged?.()
    } finally {
      setBusy(null)
    }
  }

  const log = async (sitting: Sitting, patch: { status?: string; mode?: string }) => {
    setBusy(sitting.id)
    setError(null)
    try {
      const res = await fetch(`/api/sittings/${sitting.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not update this sitting")
        toast.error(data?.error ?? "Could not update this sitting")
        return
      }
      toast.success("Sitting updated")
      await load()
    } finally {
      setBusy(null)
    }
  }

  const addExtra = async (e: React.FormEvent, enrollmentId: string) => {
    e.preventDefault()
    setBusy("extra")
    setError(null)
    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(extra),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not add that")
        toast.error(data?.error ?? "Could not add that")
        return
      }
      toast.success("Item added")
      setExtra({ name: "", rateInRupees: "", quantity: "1" })
      setExtraFor(null)
      await load()
    } finally {
      setBusy(null)
    }
  }

  const dropExtra = async (enrollmentId: string, itemId: string) => {
    setBusy(itemId)
    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}/items?itemId=${itemId}`, { method: "DELETE" })
      if (res.ok) toast.success("Item removed")
      else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? "Couldn't remove the item")
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  const now = today()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Selling a course is what makes somebody a patient — attending a consultation on its own
          does not.
        </p>
        {!enrolling && (
          <Button
            onClick={() => setEnrolling(true)}>
            <Plus className="h-4 w-4" />
            Enrol on a plan
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {enrolling && (
        <form onSubmit={enrol} className="rounded-md border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={labelClass}>Plan</span>
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className={fieldClass}
                required
              >
                <option value="">Choose a plan…</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {describePlan(p)} — {formatPrice(p.priceInPaise)}
                  </option>
                ))}
              </select>
              {plans.length === 0 && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  No plans set up yet — they are created in the clinic panel under Treatment Plans.
                </span>
              )}
            </label>

            <label>
              <span className={labelClass}>First sitting</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={fieldClass}
                required
              />
            </label>

            <label>
              <span className={labelClass}>Sittings happen</span>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className={fieldClass}>
                {SITTING_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                Sets every day to start with; individual days can be switched after.
              </span>
            </label>

            <label>
              <span className={labelClass}>Price charged (₹)</span>
              <input
                type="number"
                min={0}
                value={priceInRupees}
                onChange={(e) => setPriceInRupees(e.target.value)}
                placeholder="Plan price"
                className={fieldClass}
              />
            </label>

            <label>
              <span className={labelClass}>Notes</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the therapist should know"
                className={fieldClass}
              />
            </label>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              type="submit"
              disabled={busy === "enrol" || !planId}>
              {busy === "enrol" && <PredictSpinner className="size-4" />}
              Enrol
            </Button>
            <Button
              type="button"
              onClick={() => setEnrolling(false)} variant="outline">
              Cancel
            </Button>
          </div>
        </form>
      )}

      {courses.length === 0 && !enrolling && (
        <p className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
          Not on a course yet.
        </p>
      )}

      {courses.map(({ enrollment, sittings, items, progress, billing }) => (
        <section key={enrollment.id} className="rounded-md border border-border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{enrollment.planName}</p>
              <p className="text-xs text-muted-foreground">
                {describePlan(enrollment)} · from {enrollment.startDate} ·{" "}
                {formatPrice(enrollment.priceInPaise)}
              </p>
              {enrollment.notes && (
                <p className="mt-1 text-xs text-muted-foreground">{enrollment.notes}</p>
              )}
            </div>
            <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium">
              {enrollment.status}
            </span>
          </div>

          {/* Completion is how far through they are; adherence divides only by
              the days that have come round, so day 2 of 42 does not read as 5%. */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Done" value={`${progress.done} / ${progress.total}`} />
            <Stat
              label="Adherence"
              value={progress.adherence === null ? "—" : `${Math.round(progress.adherence * 100)}%`}
            />
            <Stat label="Missed" value={String(progress.missed)} />
            <Stat label="To log" value={String(progress.overdue)} warn={progress.overdue > 0} />
          </div>

          <Bill
            items={items}
            billing={billing}
            busy={busy}
            open={extraFor === enrollment.id}
            extra={extra}
            onExtraChange={setExtra}
            onToggle={() => setExtraFor(extraFor === enrollment.id ? null : enrollment.id)}
            onAdd={(e) => addExtra(e, enrollment.id)}
            onDrop={(itemId) => dropExtra(enrollment.id, itemId)}
          />

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Day</th>
                  <th className="py-1.5 pr-2 font-medium">Date</th>
                  <th className="py-1.5 pr-2 font-medium">Where</th>
                  <th className="py-1.5 pr-2 font-medium">Logged</th>
                  <th className="py-1.5 text-right font-medium">Happened?</th>
                </tr>
              </thead>
              <tbody>
                {sittings.map((s) => (
                  <tr
                    key={s.id}
                    className={`border-b border-border last:border-0 ${
                      s.status === "pending" && s.plannedDate <= now ? "bg-amber-50/60" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-2 font-medium">{s.dayNumber}</td>
                    <td className="py-1.5 pr-2 text-xs text-muted-foreground">{s.plannedDate}</td>
                    <td className="py-1.5 pr-2">
                      <Button
                        onClick={() =>
                          log(s, { mode: s.mode === "in_clinic" ? "at_home" : "in_clinic" })
                        }
                        disabled={busy === s.id}
                        title="Switch where this day happens" size="sm" variant="ghost">
                        {s.mode === "at_home" ? (
                          <Home className="h-3 w-3" />
                        ) : (
                          <Hospital className="h-3 w-3" />
                        )}
                        {s.mode === "at_home" ? "Home" : "Clinic"}
                      </Button>
                    </td>
                    <td className="py-1.5 pr-2 text-xs text-muted-foreground">
                      {s.loggedSource === "patient"
                        ? "By patient"
                        : s.loggedSource === "staff"
                          ? "By staff"
                          : "—"}
                    </td>
                    <td className="py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        {busy === s.id && <PredictSpinner className="size-4" />}
                        <Mark
                          active={s.status === "done"}
                          tone="done"
                          label="Done"
                          onClick={() => log(s, { status: s.status === "done" ? "pending" : "done" })}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Mark>
                        <Mark
                          active={s.status === "missed"}
                          tone="missed"
                          label="Missed"
                          onClick={() =>
                            log(s, { status: s.status === "missed" ? "pending" : "missed" })
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </Mark>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md border border-border px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`text-lg font-medium ${warn ? "text-amber-700" : ""}`}>{value}</p>
    </div>
  )
}

/** Clicking a mark that is already set clears it — a mis-click undoes itself. */
function Mark({
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
  return (
    <Button
      onClick={onClick}
      title={active ? `${label} — click to clear` : label}
      aria-label={label}
      aria-pressed={active}
      size="icon-sm"
      variant={active ? (tone === "done" ? "default" : "destructive") : "outline"}
    >
      {children}
    </Button>
  )
}

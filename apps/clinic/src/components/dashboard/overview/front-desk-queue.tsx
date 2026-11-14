"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Banknote, ClipboardList, UserCheck } from "lucide-react"
import { Empty } from "./ui"
import { queueHint } from "./queue-labels"
import { displayName } from "@/src/lib/display-name"

interface Visit {
  id: string
  name: string | null
  phone: string | null
  scheduledAt: string
  status: string
  arrivedAt: string | null
  waitingMinutes: number | null
  stage: string | null
  stageLabel: string | null
  owner: "receptionist" | "doctor" | "nutritionist" | "none"
  waitingOn: string | null
}

interface PlanOwing {
  enrollmentId: string
  contactId: string
  name: string | null
  phone: string | null
  planName: string
  totalInPaise: number
  paidInPaise: number
  outstandingInPaise: number
  untouched: boolean
}

interface Worklist {
  role: string
  mine: string[]
  visits: Visit[]
  collectable: PlanOwing[]
}

/** How often the day is re-read. */
const REFRESH_MS = 20_000

/**
 * The stages whose next move is filling in a form, and which form it is.
 *
 * Deep-linked so the row is one click from the thing it is asking for. A
 * booking created a minute ago should not need someone to open the visit, find
 * the forms panel and pick the only form they were ever going to pick.
 */
const FORM_FOR_STAGE: Record<string, string> = {
  booked: "registration_front_desk",
  registration: "registration_front_desk",
  with_doctor: "registration_clinical",
  with_nutritionist: "nutrition_consult",
}

function money(paise: number): string {
  return "₹" + Math.round(paise / 100).toLocaleString("en-IN")
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
}

/**
 * Whose move it is, right now — the front desk's queue, or the doctor's, or
 * the nutritionist's.
 *
 * The stage was already derived and already knew whose move it was, but this
 * panel was rendered once on the server: a doctor learned that the fee had
 * been paid by reloading the page. Same derivation, re-read on a timer.
 *
 * Polled rather than pushed. A clinic day moves in minutes, and a socket per
 * open tab across three apps is a lot of machinery to save twenty seconds on
 * noticing somebody already standing at the desk. Polling also survives the
 * lid of a reception laptop closing, which sockets do not.
 */
export function FrontDeskQueue() {
  const [data, setData] = useState<Worklist | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/worklist", { cache: "no-store" })
      if (res.ok) setData(await res.json())
    } catch {
      // A dropped poll is not worth a message — the next one is 20s away.
    }
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))

    const tick = setInterval(load, REFRESH_MS)
    // Coming back to the tab should not mean waiting out the rest of a tick.
    const again = () => load()
    window.addEventListener("focus", again)
    document.addEventListener("visibilitychange", again)

    return () => {
      clearInterval(tick)
      window.removeEventListener("focus", again)
      document.removeEventListener("visibilitychange", again)
    }
  }, [load])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <PredictSpinner />
      </div>
    )
  }

  const mine = (data?.visits ?? []).filter((v) => data?.mine.includes(v.owner))
  const owing = data?.collectable ?? []

  if (mine.length === 0 && owing.length === 0) {
    return (
      <Empty
        icon={ClipboardList}
        title="Nothing waiting"
        hint={queueHint(data?.role)}
      />
    )
  }

  return (
    <div className="space-y-1.5">
      {mine.map((visit) => {
        const formKey = visit.stage ? FORM_FOR_STAGE[visit.stage] : undefined
        const href = formKey
          ? `/appointments/${visit.id}?form=${formKey}`
          : `/appointments/${visit.id}`

        return (
          <Link key={visit.id} href={href} className="block">
            <div className="rounded-lg border border-black/12 bg-black/[0.02] px-3 py-2 dark:border-white/5 dark:bg-white/[0.02]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {visit.name ? displayName(visit.name) : (visit.phone ?? "Unknown")}
                  </span>
                  {/* Present and waiting is a different thing from booked for
                      later, and it is what decides who is seen next. */}
                  {visit.arrivedAt && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                      <UserCheck className="h-3 w-3" />
                      Here
                      {visit.waitingMinutes !== null && visit.waitingMinutes > 0 && (
                        <> · {visit.waitingMinutes}m</>
                      )}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-[10px] font-semibold tracking-wider text-amber-600 uppercase dark:text-amber-400">
                  {visit.stageLabel}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs text-black/60 dark:text-white/40">
                {time(visit.scheduledAt)} · {visit.waitingOn}
              </div>
              {formKey && (
                <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
                  <ClipboardList className="h-3 w-3" />
                  Fill the form
                </span>
              )}
            </div>
          </Link>
        )
      })}

      {/* Money still to collect, kept apart from the stages above.

          A prescribed course is not "the desk's move" in the workflow sense —
          on a plan with no required advance, treatment starts whether anybody
          has paid or not. The money is owed all the same, and it used to be
          visible only on the billing page. */}
      {owing.length > 0 && (
        <div className="pt-1">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-black/65 uppercase dark:text-white/45">
            <Banknote className="h-3 w-3" />
            Plans to collect on
          </p>
          {owing.map((plan) => (
            <Link key={plan.enrollmentId} href={`/people/${plan.contactId}?tab=treatment#course-${plan.enrollmentId}`} className="mt-2 block">
              <div className="rounded-lg border border-black/12 bg-black/[0.02] px-3 py-2 dark:border-white/5 dark:bg-white/[0.02]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {plan.name ? displayName(plan.name) : (plan.phone ?? "Unknown")}
                    </span>
                    {/* Nothing collected at all reads differently from a part
                        payment, and it is the one to chase first. */}
                    {plan.untouched && (
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                        nothing paid
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {money(plan.outstandingInPaise)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-black/60 dark:text-white/40">
                  {plan.planName} · {money(plan.paidInPaise)} of {money(plan.totalInPaise)} paid
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

import Link from "next/link"
import { Activity, CalendarClock, ClipboardList, Scale, TrendingDown, Users, Wallet } from "lucide-react"
import { db } from "@workspace/db/client"
import {
  appointment as appointmentTable,
  contact as contactTable,
  planEnrollment,
} from "@workspace/db/schema"
import { and, asc, count, eq, gte, isNull, lte, or, sql } from "@workspace/db"
import { appointmentInClinic } from "@workspace/db/appointment-scope"
import { isPartnerClinic } from "@workspace/db/clinic-service"
import { ContactStage } from "@workspace/db/contact-stage"
import { Empty, Panel, PanelLink, StatCard, dayBounds, formatDateTime } from "./ui"
import { withPatientNames } from "./names"
import { BucketChart } from "./bucket-chart"
import { FrontDeskQueue } from "./front-desk-queue"
import { queueTitle } from "./queue-labels"
import { EXPENSES_ALL } from "@workspace/db/expense"
import { collectedBetween, expenseSummary, indiaToday, postDueRecurring } from "@workspace/db/expense-service"
import { clinicContext } from "@/src/lib/auth/clinic"

/**
 * How the clinic is doing today: the funnel and the day's schedule.
 *
 * For anyone whose job is the clinic rather than a caseload inside it. The
 * numbers are read-only: this block reports. Getting somewhere is the
 * sidebar's job, and the panel headings link on to the full page.
 */
export async function ClinicOverview({
  held,
  role,
}: {
  held: Set<string>
  role?: string | null
}) {
  const context = await clinicContext()
  if (!context) return null
  const clinicId = context.clinic.id

  // Every number below is this clinic's. A contact nobody placed yet counts
  // for our own clinics, never for a partner hospital.
  const ownAppointments = appointmentInClinic(clinicId)
  const ownContacts = isPartnerClinic(context.clinic)
    ? eq(contactTable.clinicId, clinicId)
    : or(eq(contactTable.clinicId, clinicId), isNull(contactTable.clinicId))

  const { start, end } = dayBounds()
  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const [stageRows, todayRows, weekRows, inTreatmentRows, weekAheadRows] = await Promise.all([
    db
      .select({ stage: contactTable.stage, count: count() })
      .from(contactTable)
      .where(ownContacts)
      .groupBy(contactTable.stage),
    db
      .select({ count: count() })
      .from(appointmentTable)
      .where(and(ownAppointments, gte(appointmentTable.scheduledAt, start), lte(appointmentTable.scheduledAt, end))),
    db
      .select({ count: count() })
      .from(appointmentTable)
      .where(and(ownAppointments, gte(appointmentTable.scheduledAt, start), lte(appointmentTable.scheduledAt, weekAhead))),
    // Patients on a course right now. This replaces an Open Leads count:
    // lead work is the operations console's job, and a clinic screen showing
    // it sent whoever read it to the wrong app.
    db
      .select({ count: count() })
      .from(planEnrollment)
      .where(and(eq(planEnrollment.clinicId, clinicId), eq(planEnrollment.status, "active"))),
    // The week ahead, a bar per day. Everything else on this screen looks
    // backwards or at right now; what someone running the day actually plans
    // around is which days are already full and which are empty.
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${appointmentTable.scheduledAt}), 'Dy DD')`,
        count: count(),
      })
      .from(appointmentTable)
      .where(and(ownAppointments, gte(appointmentTable.scheduledAt, start), lte(appointmentTable.scheduledAt, weekAhead)))
      .groupBy(sql`date_trunc('day', ${appointmentTable.scheduledAt})`)
      .orderBy(sql`date_trunc('day', ${appointmentTable.scheduledAt})`),
  ])

  // The month's margin, for whoever holds the books — salaries are in it.
  const margin = held.has(EXPENSES_ALL) ? await monthMargin() : null

  const byStage = new Map(stageRows.map((r) => [r.stage, r.count]))
  const stageOf = (s: string) => byStage.get(s) ?? 0

  const todaySchedule = await withPatientNames(
    await db.query.appointment.findMany({
      where: and(ownAppointments, gte(appointmentTable.scheduledAt, start), lte(appointmentTable.scheduledAt, end)),
      orderBy: [asc(appointmentTable.scheduledAt)],
      limit: 6,
    }),
  )

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard
          label="Patients"
          value={stageOf(ContactStage.PATIENT)}
          icon={Users}
          color="text-emerald-500 bg-emerald-500/10"
        />
        {/* Was "Open Leads". A lead is not the clinic's work — chasing one
            happens in the operations console, and a count of them here only
            ever sent whoever read it to the wrong app. What a clinic screen
            wants to know is how many people are actually under treatment. */}
        <StatCard
          label="In Treatment"
          value={inTreatmentRows[0]?.count ?? 0}
          icon={Activity}
          color="text-amber-500 bg-amber-500/10"
          hint="on an active course"
        />
        <StatCard
          label="Appointments Today"
          value={todayRows[0]?.count ?? 0}
          icon={CalendarClock}
          color="text-blue-500 bg-blue-500/10"
        />
        <StatCard
          label="Next 7 Days"
          value={weekRows[0]?.count ?? 0}
          icon={Activity}
          color="text-purple-500 bg-purple-500/10"
        />
      </div>

      {margin && (
        <Link href="/billing#summary" className="grid grid-cols-3 gap-2 sm:gap-3" title="Open the profit on Billing">
          <StatCard label="Collected this month" value={rupees(margin.collected)} icon={Wallet} color="text-emerald-500 bg-emerald-500/10" />
          <StatCard label="Expenses this month" value={rupees(margin.spent)} icon={TrendingDown} color="text-red-500 bg-red-500/10" />
          <StatCard
            label="Net this month"
            value={rupees(margin.collected - margin.spent)}
            icon={Scale}
            color={margin.collected >= margin.spent ? "text-emerald-500 bg-emerald-500/10" : "text-red-500 bg-red-500/10"}
            hint="collected − expenses"
          />
        </Link>
      )}

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <Panel title="The Week Ahead" icon={CalendarClock}>
            <BucketChart
              rows={weekAheadRows}
              headline={weekRows[0]?.count ?? 0}
              caption="booked over the next 7 days"
            />
          </Panel>
        </div>

        {/* A fixed height for the row: each list scrolls inside its own card,
            so a short schedule no longer squeezes the queue beside it. */}
        <div className="relative lg:col-span-7 lg:h-[420px]">
          <Panel
            title="Today's Schedule"
            icon={CalendarClock}
            fill
            scroll
            action={held.has("clinic.appointments") ? <PanelLink href="/appointments" label="View All" /> : null}
          >
            {todaySchedule.length === 0 ? (
              <Empty
                icon={CalendarClock}
                title="Nothing booked today"
                hint="Appointments for today will appear here."
              />
            ) : (
              <div className="divide-y divide-black/18 dark:divide-white/10">
                {todaySchedule.map((apt) => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{apt.patientName}</div>
                      <div className="mt-0.5 text-xs text-black/65 dark:text-white/45">
                        {formatDateTime(apt.scheduledAt)} ·{" "}
                        <span className="capitalize">{apt.type.replace("_", " ")}</span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-black/65 dark:text-white/45">
                      {apt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/*
          Was "Newest Contacts" — a list of leads and walk-ins, which is the
          operations console's work and not the clinic's. It also read as a
          to-do list on a screen where nothing could be done about it.

          What belongs here is the front desk's own queue: today's patients
          whose next move is theirs. Same derivation as the visit page, so the
          two can never disagree about what is outstanding.
        */}
        <div className="relative lg:col-span-5 lg:h-[420px]">
          <Panel title={queueTitle(role)} icon={ClipboardList} fill scroll>
            {/* Live: re-read on a timer, so a fee taken at the desk reaches the
                doctor and a plan prescribed reaches the desk without a reload.
                Role-aware too — it shows whoever is looking at it their own
                move, from the same derivation the visit page uses. */}
            <FrontDeskQueue />
          </Panel>
        </div>
      </div>
    </>
  )
}

function rupees(paise: number): string {
  return (paise < 0 ? "−" : "") + "₹" + Math.round(Math.abs(paise) / 100).toLocaleString("en-IN")
}

/** This month so far, for the clinic being looked at. */
async function monthMargin(): Promise<{ collected: number; spent: number } | null> {
  const context = await clinicContext()
  if (!context) return null
  const today = indiaToday()
  const from = today.slice(0, 8) + "01"
  await postDueRecurring(db, context.clinic.id).catch(() => 0)
  const [collected, spent] = await Promise.all([
    collectedBetween(db, context.clinic.id, from, today),
    expenseSummary(db, { clinicId: context.clinic.id, from, to: today }),
  ])
  return { collected, spent: spent.spentInPaise }
}

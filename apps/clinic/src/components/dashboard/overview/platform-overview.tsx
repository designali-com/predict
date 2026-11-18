import Link from "next/link"
import { AlertTriangle, CalendarCheck, ShieldCheck, TrendingUp, Users } from "lucide-react"
import { db } from "@workspace/db/client"
import {
  appointment as appointmentTable,
  automationFlowRun,
  communicationMessage,
  contact as contactTable,
  user as userTable,
} from "@workspace/db/schema"
import { and, count, eq, gte, sql, type SQL } from "@workspace/db"
import { ContactStage } from "@workspace/db/contact-stage"
import { listRoles, staffRoles } from "@workspace/db/role-service"
import { Panel, PanelLink, StatCard } from "./ui"
import { BucketChart } from "./bucket-chart"
import { PeriodSelect } from "./period-select"
import { type Period, periodLabel, periodStart, trendSpec } from "./period"

/**
 * The platform owner's view: totals and ratios, not a worklist.
 *
 * Deliberately has no schedule and no individual appointments on it. Whoever
 * runs the clinic does not work a caseload, so "here are today's six visits"
 * is somebody else's screen — the questions at this level are how many, out of
 * how many, and which way the line is going.
 *
 * Everything is drawn from records that already exist. Sections a healthcare
 * platform owner would also expect — billing, pharmacy, laboratory, branches —
 * are absent rather than stubbed: this product keeps no such records yet, and
 * a card reading 0 would say "nothing happened" where the truth is "not built".
 */

/** Percentage of a whole, guarding the empty case so a new clinic reads 0%. */
function share(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

export async function PlatformOverview({
  appointmentsPeriod,
  contactsPeriod,
}: {
  appointmentsPeriod: Period
  contactsPeriod: Period
}) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [stageRows, userRows, roles, staff, headcount, failedRuns, failedSends, sourceRows] =
    await Promise.all([
      db
        .select({ stage: contactTable.stage, count: count() })
        .from(contactTable)
        .groupBy(contactTable.stage),
      db.select({ count: count() }).from(userTable),
      listRoles(db),
      staffRoles(db),
      db.select({ role: userTable.role, count: count() }).from(userTable).groupBy(userTable.role),
      db
        .select({ count: count() })
        .from(automationFlowRun)
        .where(
          and(eq(automationFlowRun.status, "failed"), gte(automationFlowRun.startedAt, weekAgo)),
        ),
      db
        .select({ count: count() })
        .from(communicationMessage)
        .where(
          and(
            eq(communicationMessage.status, "failed"),
            gte(communicationMessage.createdAt, weekAgo),
          ),
        ),
      db
        .select({ source: contactTable.source, count: count() })
        .from(contactTable)
        .groupBy(contactTable.source),
    ])

  const byStage = new Map(stageRows.map((r) => [r.stage, r.count]))
  const stageOf = (s: string) => byStage.get(s) ?? 0
  const totalContacts = stageRows.reduce((sum, r) => sum + r.count, 0)

  const booked = stageOf(ContactStage.BOOKED)
  const patients = stageOf(ContactStage.PATIENT)

  const byRole = new Map(headcount.map((r) => [(r.role ?? "").toLowerCase(), r.count]))
  const staffKeys = new Set(staff.map((r) => r.key))
  const staffRolesShown = roles.filter((r) => staffKeys.has(r.key))
  const totalStaff = staffRolesShown.reduce((sum, r) => sum + (byRole.get(r.key) ?? 0), 0)

  const runFailures = failedRuns[0]?.count ?? 0
  const sendFailures = failedSends[0]?.count ?? 0

  // Booking is the conversion that matters commercially; attendance is the one
  // that matters clinically. Reporting only "patients" would hide a clinic
  // that books well and gets stood up.
  const bookingRate = share(booked + patients, totalContacts)
  const conversionRate = share(patients, totalContacts)

  const funnel = [
    { label: "All contacts", value: totalContacts },
    { label: "Booked", value: booked + patients },
    { label: "Attended", value: patients },
  ]

  const stages = [
    { label: "Lead", value: stageOf(ContactStage.LEAD) },
    { label: "Booked", value: booked },
    { label: "Patient", value: patients },
    { label: "Inactive", value: stageOf(ContactStage.INACTIVE) },
    { label: "Lost", value: stageOf(ContactStage.LOST) },
  ]

  const sources = sourceRows
    .map((r) => ({ label: r.source ?? "Unknown", value: r.count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const [allAppointments] = await db.select({ count: count() }).from(appointmentTable)

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Users"
          value={userRows[0]?.count ?? 0}
          icon={Users}
          color="text-blue-500 bg-blue-500/10"
          hint={`${totalStaff} staff · ${totalContacts} contacts`}
        />
        <StatCard
          label="Total Appointments"
          value={allAppointments?.count ?? 0}
          icon={CalendarCheck}
          color="text-emerald-500 bg-emerald-500/10"
          hint="all time"
        />
        <StatCard
          label="Lead Conversion"
          value={`${conversionRate}%`}
          icon={TrendingUp}
          color="text-purple-500 bg-purple-500/10"
          hint={`${bookingRate}% booked, all time`}
        />
        <StatCard
          label="Failures This Week"
          value={runFailures + sendFailures}
          icon={AlertTriangle}
          color={
            runFailures + sendFailures > 0 ? "text-red-500 bg-red-500/10" : "text-black/65 bg-black/5"
          }
          hint={`${runFailures} flow · ${sendFailures} message`}
        />
      </div>

      {/* Appointments first: whether visits are being booked and kept is the
          question this dashboard exists to answer. */}
      <AppointmentsSection period={appointmentsPeriod} />

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ContactsPanel period={contactsPeriod} />
        </div>

        <div className="lg:col-span-5">
          <Panel title="Conversion" icon={TrendingUp} fill>
            <Funnel steps={funnel} />
            <div className="mt-5 border-t border-black/12 pt-4 dark:border-white/5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
                By stage
              </p>
              <Breakdown rows={stages} total={totalContacts} />
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-12">
          <Panel title="Where Contacts Come From" icon={ShieldCheck}>
            {sources.length === 0 ? (
              <p className="flex flex-1 items-center justify-center text-sm text-black/65 dark:text-white/40">
                No contacts yet.
              </p>
            ) : (
              <Breakdown rows={sources} total={totalContacts} />
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Team" icon={Users} action={<PanelLink href="/team" label="Manage" />}>
        {/* Count first, name after: the number is the data and the roles are
            few and short, so they read as a line rather than a grid of boxes
            that were nine parts padding to one part figure. */}
        <div className="flex flex-wrap gap-2">
          {staffRolesShown.map((role) => (
            <Link
              key={role.key}
              href={`/team?role=${role.key}`}
              className="flex items-baseline gap-2 rounded-md border border-black/18 px-3 py-2 transition-colors hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
            >
              <span className="text-lg font-medium tabular-nums">
                {(byRole.get(role.key) ?? 0).toLocaleString()}
              </span>
              <span className="text-xs text-black/65 dark:text-white/50">{role.label}</span>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-black/60 dark:text-white/40">
          {totalStaff} {totalStaff === 1 ? "person" : "people"} across {staffRolesShown.length} roles
          · {roles.filter((r) => !r.isSystem).length} roles created here
        </p>
      </Panel>
    </>
  )
}

/**
 * Bucketed counts over the window the period asks for.
 *
 * The unit is interpolated into date_trunc, which is why it comes from
 * trendSpec's closed set and never from the request.
 */
async function trend(
  column: typeof contactTable.createdAt | typeof appointmentTable.scheduledAt,
  period: Period,
): Promise<{ bucket: string; count: number }[]> {
  const { unit, since, format } = trendSpec(period)
  const truncated = sql`date_trunc('${sql.raw(unit)}', ${column})`

  const query = db
    .select({ bucket: sql<string>`to_char(${truncated}, '${sql.raw(format)}')`, count: count() })
    .from(column === contactTable.createdAt ? contactTable : appointmentTable)
    .groupBy(truncated)
    .orderBy(truncated)

  return since ? query.where(gte(column, since)) : query
}

async function AppointmentsSection({ period }: { period: Period }) {
  const start = periodStart(period)
  const inPeriod: SQL | undefined = start ? gte(appointmentTable.scheduledAt, start) : undefined

  const [[totals], buckets] = await Promise.all([
    db
      .select({
        total: count(),
        completed: sql<number>`count(*) filter (where ${appointmentTable.status} = 'completed')::int`,
        cancelled: sql<number>`count(*) filter (where ${appointmentTable.status} = 'cancelled')::int`,
        noShow: sql<number>`count(*) filter (where ${appointmentTable.status} = 'no_show')::int`,
        scheduled: sql<number>`count(*) filter (where ${appointmentTable.status} = 'scheduled')::int`,
        confirmed: sql<number>`count(*) filter (where ${appointmentTable.status} = 'confirmed')::int`,
      })
      .from(appointmentTable)
      .where(inPeriod),
    trend(appointmentTable.scheduledAt, period),
  ])

  const total = totals?.total ?? 0
  const completed = totals?.completed ?? 0
  const cancelled = totals?.cancelled ?? 0
  const noShow = totals?.noShow ?? 0
  const seen = completed + noShow

  const outcomes = [
    { label: "Scheduled", value: totals?.scheduled ?? 0 },
    { label: "Confirmed", value: totals?.confirmed ?? 0 },
    { label: "Completed", value: completed },
    { label: "Cancelled", value: cancelled },
    { label: "No show", value: noShow },
  ]

  const label = periodLabel(period).toLowerCase()

  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <Panel
          title="Appointments"
          icon={CalendarCheck}
          fill
          action={<PeriodSelect param="appointments" value={period} />}
        >
          <BucketChart rows={buckets} headline={total} caption={`booked ${label}`} />
        </Panel>
      </div>

      <div className="lg:col-span-5">
        <Panel title="Outcomes" icon={CalendarCheck} fill>
          <div className="mb-4 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <p className="text-xl font-semibold tabular-nums">{share(completed, seen)}%</p>
              <p className="text-xs text-black/60 dark:text-white/45">
                attended{seen > 0 ? ` of ${seen} seen` : ""}
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{share(cancelled, total)}%</p>
              <p className="text-xs text-black/60 dark:text-white/45">cancelled</p>
            </div>
          </div>
          {total === 0 ? (
            <p className="flex flex-1 items-center justify-center text-sm text-black/65 dark:text-white/40">
              Nothing booked {label}.
            </p>
          ) : (
            <Breakdown rows={outcomes} total={total} />
          )}
        </Panel>
      </div>
    </div>
  )
}

async function ContactsPanel({ period }: { period: Period }) {
  const start = periodStart(period)

  const [[totals], buckets] = await Promise.all([
    db
      .select({ count: count() })
      .from(contactTable)
      .where(start ? gte(contactTable.createdAt, start) : undefined),
    trend(contactTable.createdAt, period),
  ])

  return (
    <Panel
      title="New Contacts"
      icon={TrendingUp}
      fill
      action={<PeriodSelect param="contacts" value={period} />}
    >
      <BucketChart
        rows={buckets}
        headline={totals?.count ?? 0}
        caption={`new ${periodLabel(period).toLowerCase()}`}
      />
    </Panel>
  )
}

/** Stacked steps of a funnel, each measured against the step above it. */
function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = steps[0]?.value ?? 0

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const width = top > 0 ? Math.max((step.value / top) * 100, 1) : 1
        const previous = steps[i - 1]
        return (
          <div key={step.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{step.label}</span>
              <span className="tabular-nums">
                {step.value.toLocaleString()}
                {previous && (
                  <span className="ml-2 text-xs text-black/60 dark:text-white/40">
                    {share(step.value, previous.value)}% of {previous.label.toLowerCase()}
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${width}%`, opacity: 1 - i * 0.25 }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** A labelled share list — a table would out-shout the charts beside it. */
function Breakdown({ rows, total }: { rows: { label: string; value: number }[]; total: number }) {
  return (
    <div className="flex flex-col justify-around gap-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 truncate text-black/70 dark:text-white/70">
            {row.label}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-primary/60"
              style={{ width: `${share(row.value, total)}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right tabular-nums text-black/60 dark:text-white/55">
            {row.value.toLocaleString()}
            <span className="ml-1.5 text-xs text-black/65 dark:text-white/35">
              {share(row.value, total)}%
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

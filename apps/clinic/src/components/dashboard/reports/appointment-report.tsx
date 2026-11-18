import { db } from "@workspace/db/client"
import { appointment, user } from "@workspace/db/schema"
import { and, count, eq, gte, isNotNull, lte, sql, type SQL } from "@workspace/db"
import { CalendarCheck, Clock, TrendingUp, UserX } from "lucide-react"
import { Panel } from "../overview/ui"
import { BucketChart } from "../overview/bucket-chart"
import { trendSpec, type Period } from "../overview/period"
import { FunnelSteps, Metric, NotTracked, ShareTable } from "./ui"
import { appointmentInClinic } from "@workspace/db/appointment-scope"
import { clinicContext } from "@/src/lib/auth/clinic"

/**
 * What a clinic asks of its appointment book.
 *
 * The four questions, in the order they cost money: are visits being booked,
 * are they being kept, when are they being lost, and how far ahead is the book
 * filling. Everything here answers one of those — a chart that answers none is
 * decoration on a report nobody reads twice.
 *
 * Attendance is measured against visits that were actually due, not against
 * everything ever booked: counting a visit scheduled for next week as "not
 * attended" would drag the rate down by however busy next week is.
 */

const TYPE_LABELS: Record<string, string> = {
  consultation: "Consultation",
  review: "Review",
}

const CHANNEL_LABELS: Record<string, string> = {
  in_clinic: "In-clinic",
  virtual: "Virtual",
}

function rate(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

export async function AppointmentReport({ period, since }: { period: Period; since: Date | null }) {
  const context = await clinicContext()
  if (!context) return null
  // This clinic's book only — every query below filters on inRange, so the
  // clinic rides along with the date.
  const inRange: SQL | undefined = and(
    appointmentInClinic(context.clinic.id),
    since ? gte(appointment.scheduledAt, since) : undefined,
  )
  const { unit, format } = trendSpec(period)
  const truncated = sql`date_trunc('${sql.raw(unit)}', ${appointment.scheduledAt})`

  const [[totals], typeRows, channelRows, doctorRows, weekdayRows, buckets, [leadTime]] =
    await Promise.all([
      db
        .select({
          total: count(),
          completed: sql<number>`count(*) filter (where ${appointment.status} = 'completed')::int`,
          cancelled: sql<number>`count(*) filter (where ${appointment.status} = 'cancelled')::int`,
          noShow: sql<number>`count(*) filter (where ${appointment.status} = 'no_show')::int`,
          scheduled: sql<number>`count(*) filter (where ${appointment.status} = 'scheduled')::int`,
          confirmed: sql<number>`count(*) filter (where ${appointment.status} = 'confirmed')::int`,
          upcoming: sql<number>`count(*) filter (where ${appointment.scheduledAt} > now())::int`,
        })
        .from(appointment)
        .where(inRange),
      db
        .select({ key: appointment.type, n: count() })
        .from(appointment)
        .where(inRange)
        .groupBy(appointment.type),
      db
        .select({ key: appointment.channel, n: count() })
        .from(appointment)
        .where(inRange)
        .groupBy(appointment.channel),
      db
        .select({ name: user.name, n: count() })
        .from(appointment)
        .innerJoin(user, eq(user.id, appointment.doctorUserId))
        .where(and(inRange, isNotNull(appointment.doctorUserId)))
        .groupBy(user.name),
      // Which days the clinic is actually busy — the input to a staffing
      // decision, and the one thing a list of appointments cannot show.
      db
        .select({
          day: sql<string>`to_char(${appointment.scheduledAt}, 'Dy')`,
          order: sql<number>`extract(isodow from ${appointment.scheduledAt})::int`,
          n: count(),
        })
        .from(appointment)
        .where(inRange)
        .groupBy(
          sql`to_char(${appointment.scheduledAt}, 'Dy')`,
          sql`extract(isodow from ${appointment.scheduledAt})`,
        )
        .orderBy(sql`extract(isodow from ${appointment.scheduledAt})`),
      db
        .select({ bucket: sql<string>`to_char(${truncated}, '${sql.raw(format)}')`, count: count() })
        .from(appointment)
        .where(inRange)
        .groupBy(truncated)
        .orderBy(truncated),
      // Booked-on to visit date. A book that fills same-day is a book with no
      // forward load; one that fills weeks out cannot absorb an urgent case.
      db
        .select({
          days: sql<
            number | null
          >`round(avg(extract(epoch from (${appointment.scheduledAt} - ${appointment.createdAt})) / 86400)::numeric, 1)`,
        })
        .from(appointment)
        .where(inRange),
    ])

  const total = totals?.total ?? 0
  const completed = totals?.completed ?? 0
  const cancelled = totals?.cancelled ?? 0
  const noShow = totals?.noShow ?? 0

  // Only visits whose date has passed can be attended or missed. Anything
  // still ahead is neither, and folding it in would understate attendance by
  // however full the diary is.
  const concluded = completed + noShow + cancelled

  const statuses = [
    { label: "Completed", value: completed },
    { label: "Confirmed", value: totals?.confirmed ?? 0 },
    { label: "Scheduled", value: totals?.scheduled ?? 0 },
    { label: "Cancelled", value: cancelled },
    { label: "No show", value: noShow },
  ]

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Booked" value={total} of={`${totals?.upcoming ?? 0} still upcoming`} />
        <Metric
          label="Attendance rate"
          value={`${rate(completed, completed + noShow)}%`}
          of={`${completed} attended of ${completed + noShow} due`}
        />
        <Metric
          label="No-show rate"
          value={`${rate(noShow, completed + noShow)}%`}
          of={`${noShow} missed`}
          tone={rate(noShow, completed + noShow) > 15 ? "bad" : undefined}
        />
        <Metric
          label="Cancellation rate"
          value={`${rate(cancelled, concluded)}%`}
          of={`${cancelled} cancelled of ${concluded} concluded`}
          tone={rate(cancelled, concluded) > 20 ? "bad" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Panel title="Booked over time" icon={TrendingUp} fill>
            <BucketChart rows={buckets} headline={total} caption="booked in this period" />
          </Panel>
        </div>

        <div className="lg:col-span-5">
          <Panel title="What happened to them" icon={CalendarCheck} fill>
            <FunnelSteps
              steps={[
                { label: "Booked", value: total },
                { label: "Reached the date", value: completed + noShow },
                { label: "Attended", value: completed },
              ]}
            />
            <div className="mt-5 border-t border-black/12 pt-4 dark:border-white/5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
                By status
              </p>
              <ShareTable rows={statuses} total={total} empty="Nothing booked in this period." />
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Panel title="Visit type" icon={CalendarCheck} fill>
            <ShareTable
              rows={typeRows.map((r) => ({ label: TYPE_LABELS[r.key] ?? r.key, value: r.n }))}
              total={total}
            />
          </Panel>
        </div>

        <div className="lg:col-span-4">
          <Panel title="Channel" icon={CalendarCheck} fill>
            <ShareTable
              rows={channelRows.map((r) => ({
                label: r.key ? (CHANNEL_LABELS[r.key] ?? r.key) : "Not set",
                value: r.n,
              }))}
              total={total}
            />
          </Panel>
        </div>

        <div className="lg:col-span-4">
          <Panel title="Busiest days" icon={Clock} fill>
            <ShareTable
              rows={weekdayRows.map((r) => ({ label: r.day.trim(), value: r.n }))}
              total={total}
              empty="No visits to spread across the week yet."
            />
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Panel title="Load per doctor" icon={UserX} fill>
            {doctorRows.length === 0 ? (
              <NotTracked
                what="No appointment has a doctor assigned"
                why="Bookings are being made without picking one, so there is nothing to spread across the team. The doctor field is on the booking form."
              />
            ) : (
              <ShareTable
                rows={doctorRows.map((r) => ({ label: r.name, value: r.n }))}
                total={doctorRows.reduce((s, r) => s + r.n, 0)}
              />
            )}
          </Panel>
        </div>

        <div className="lg:col-span-5">
          <Panel title="Booking lead time" icon={Clock} fill>
            <div className="flex flex-1 flex-col justify-center">
              <p className="text-3xl font-semibold tabular-nums tracking-tight">
                {leadTime?.days != null ? `${leadTime.days} days` : "—"}
              </p>
              <p className="mt-1 text-sm text-black/60 dark:text-white/45">
                average between booking and the visit
              </p>
              <p className="mt-4 text-xs text-black/60 dark:text-white/40">
                Near zero means the book is filled same-day and carries no forward load. Long lead
                times fill the diary but leave no room for an urgent case.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}

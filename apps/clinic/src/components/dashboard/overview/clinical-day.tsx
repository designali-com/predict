import Link from "next/link"
import {
  Activity,
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Clock,
  ListTodo,
  MapPin,
  User,
  Users,
  Video,
} from "lucide-react"
import { db } from "@workspace/db/client"
import {
  appointment as appointmentTable,
  contact as contactTable,
  task as taskTable,
} from "@workspace/db/schema"
import { and, asc, count, eq, gte, isNull, lte, or } from "@workspace/db"
import { appointmentInClinic } from "@workspace/db/appointment-scope"
import { isPartnerClinic } from "@workspace/db/clinic-service"
import { clinicContext } from "@/src/lib/auth/clinic"
import { ContactStage } from "@workspace/db/contact-stage"
import { Empty, Panel, PanelLink, StatCard, dayBounds, formatDate, formatDateTime } from "./ui"
import { withPatientNames, withTaskPatientNames } from "./names"
import { FrontDeskQueue } from "./front-desk-queue"

/**
 * One clinician's day: the appointments assigned to them and the tasks waiting
 * on them.
 *
 * Shown to whoever has that work on the books, which is a question about the
 * data rather than about a job title — a role invented next month lands here
 * the first time someone books a patient with them.
 */
export async function ClinicalDay({
  userId,
  role,
  scope,
  held,
}: {
  userId: string
  role?: string | null
  scope: "mine" | "all"
  held: Set<string>
}) {
  const context = await clinicContext()
  if (!context) return null
  const clinicId = context.clinic.id

  // The day at THIS clinic. A doctor who also sits at another branch sees that
  // branch's list when they switch to it, not mixed into this one.
  const mine = scope === "mine"
  const onlyMine = and(
    appointmentInClinic(clinicId),
    mine ? eq(appointmentTable.doctorUserId, userId) : undefined,
  )
  const myTasks = and(
    eq(taskTable.clinicId, clinicId),
    mine ? or(eq(taskTable.assignedUserId, userId), eq(taskTable.assignedRole, role ?? "")) : undefined,
  )

  const { start, end } = dayBounds()

  const [todayRows, openTaskRows, completedRows] = await Promise.all([
    db
      .select({ count: count() })
      .from(appointmentTable)
      .where(
        and(onlyMine, gte(appointmentTable.scheduledAt, start), lte(appointmentTable.scheduledAt, end)),
      ),
    db
      .select({ count: count() })
      .from(taskTable)
      .where(and(myTasks, eq(taskTable.status, "open"))),
    db
      .select({ count: count() })
      .from(appointmentTable)
      .where(and(onlyMine, eq(appointmentTable.status, "completed"))),
  ])

  let patientCount = 0
  if (mine) {
    const seen = await db.query.appointment.findMany({
      where: onlyMine,
      columns: { contactId: true },
    })
    patientCount = new Set(seen.map((a) => a.contactId)).size
  } else {
    const [row] = await db
      .select({ count: count() })
      .from(contactTable)
      .where(
        and(
          eq(contactTable.stage, ContactStage.PATIENT),
          // Unplaced contacts count for our own clinics, never for a partner.
          isPartnerClinic(context.clinic)
            ? eq(contactTable.clinicId, clinicId)
            : or(eq(contactTable.clinicId, clinicId), isNull(contactTable.clinicId)),
        ),
      )
    patientCount = row?.count ?? 0
  }

  const appointments = await withPatientNames(
    await db.query.appointment.findMany({
      where: and(onlyMine, gte(appointmentTable.scheduledAt, new Date())),
      orderBy: [asc(appointmentTable.scheduledAt)],
      limit: 5,
    }),
  )

  const tasks = await withTaskPatientNames(
    await db.query.task.findMany({
      where: and(myTasks, eq(taskTable.status, "open")),
      orderBy: [asc(taskTable.dueAt)],
      limit: 5,
    }),
  )

  const canOpenAppointments = held.has("clinic.appointments")

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard
          label="Today's Appointments"
          value={todayRows[0]?.count ?? 0}
          icon={CalendarClock}
          color="text-blue-500 bg-blue-500/10"
        />
        <StatCard
          label={mine ? "My Patients" : "Active Patients"}
          value={patientCount}
          icon={Users}
          color="text-emerald-500 bg-emerald-500/10"
        />
        <StatCard
          label="Pending Tasks"
          value={openTaskRows[0]?.count ?? 0}
          icon={ListTodo}
          color="text-amber-500 bg-amber-500/10"
        />
        <StatCard
          label="Completed Visits"
          value={completedRows[0]?.count ?? 0}
          icon={Activity}
          color="text-purple-500 bg-purple-500/10"
        />
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Panel
            title="Upcoming Appointments"
            icon={CalendarClock}
            fill
            action={canOpenAppointments ? <PanelLink href="/appointments" label="View All" /> : null}
          >
            {appointments.length === 0 ? (
              <Empty
                icon={CalendarClock}
                title="Nothing scheduled"
                hint={
                  mine
                    ? "Appointments assigned to you will appear here."
                    : "The clinic has no upcoming appointments."
                }
              />
            ) : (
              <div className="divide-y divide-black/18 dark:divide-white/10">
                {appointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0 sm:items-center sm:gap-4"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 hidden h-10 w-10 shrink-0 items-center sm:flex justify-center rounded-lg border border-black/18 bg-black/5 dark:border-white/10 dark:bg-white/5">
                        <User className="h-5 w-5 opacity-75" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{apt.patientName}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-black/65 dark:text-white/45">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateTime(apt.scheduledAt)}
                          </span>
                          <span>·</span>
                          <span className="capitalize">{apt.type.replace("_", " ")}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            {apt.channel === "virtual" ? (
                              <>
                                <Video className="h-3 w-3" /> Virtual
                              </>
                            ) : (
                              <>
                                <MapPin className="h-3 w-3" /> In-Clinic
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          apt.status === "confirmed"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {apt.status}
                      </span>
                      {canOpenAppointments && (
                        <Link
                          href={`/appointments/${apt.id}`}
                          className="rounded-lg border border-black/18 p-2 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="lg:col-span-4">
          {/* Patients and tasks in one column, because they are the same
              question asked twice: what is waiting on me. Two cards side by
              side made a doctor check one, then the other, to answer it.

              Patients first — somebody is standing in the building. */}
          <Panel title="Waiting for the action" icon={ClipboardList} fill>
            <FrontDeskQueue />

            {tasks.length > 0 && (
              <div className="mt-4 space-y-3 border-t border-black/12 pt-4 dark:border-white/5">
                <p className="text-[10px] font-semibold tracking-wider text-black/65 uppercase dark:text-white/45">
                  Tasks
                </p>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-lg border border-black/12 bg-black/[0.02] p-3 text-sm dark:border-white/5 dark:bg-white/[0.02]"
                  >
                    <div className="font-semibold text-black/85 dark:text-white/90">
                      {task.title}
                    </div>
                    {task.notes && (
                      <p className="mt-1 line-clamp-2 text-xs text-black/60 dark:text-white/60">
                        {task.notes}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between text-xs text-black/60 dark:text-white/40">
                      <span className="font-medium text-primary">{task.patientName}</span>
                      {task.dueAt && <span>Due: {formatDate(task.dueAt)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}

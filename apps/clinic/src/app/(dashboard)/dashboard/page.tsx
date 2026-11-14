import Link from "next/link"
import { PageHeader } from "@workspace/ui/components/page-header"
import { db } from "@workspace/db/client"
import { appointment as appointmentTable, task as taskTable } from "@workspace/db/schema"
import { and, count, eq } from "@workspace/db"
import { grantedPermissions, isUnrestricted } from "@workspace/db/permission-service"
import { requirePermission } from "@/src/lib/auth/permissions"
import { appointmentInClinic } from "@workspace/db/appointment-scope"
import { clinicContext } from "@/src/lib/auth/clinic"
import { ClinicalDay } from "@/src/components/dashboard/overview/clinical-day"
import { ClinicOverview } from "@/src/components/dashboard/overview/clinic-overview"
import { PlatformOverview } from "@/src/components/dashboard/overview/platform-overview"
import { PredictOverview } from "@/src/components/dashboard/overview/predict-overview"
import { resolvePeriod } from "@/src/components/dashboard/overview/period"

/**
 * One dashboard shell, composed from blocks.
 *
 * Not one dashboard per role: that is how this codebase started — four
 * near-identical pages under four role-named folders — and it cannot describe
 * a role a clinic invents for itself. The shell is common; which blocks appear
 * is the decision.
 *
 * Two signals choose the blocks, and neither is a role name:
 *
 *   own work    Does this person have appointments or tasks assigned to them?
 *               That is a fact about the data, so a role created next month
 *               starts getting a clinician's day the first time someone books
 *               a patient with them.
 *
 *   platform    Are they the platform owner (superadmin)? Then they get
 *               staffing and system health across every clinic instead of a
 *               caseload they do not have.
 *
 * Both can be true — an owner who also sees patients gets their day first and
 * the platform block below it.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; appointments?: string; contacts?: string }>
}) {
  const session = await requirePermission("clinic.home")
  const userId = session.user.id
  const { scope: requestedScope, appointments, contacts } = await searchParams

  // Grants and work both come from the clinic this person is acting in: the
  // role held HERE, and the visits and tasks booked HERE. A doctor whose
  // caseload is at another branch is not "a clinician" on this one's screen.
  const context = await clinicContext()
  const held = new Set(await grantedPermissions(db, context?.principal ?? session.user))
  const unrestricted = isUnrestricted(session.user.role)

  const [ownAppointments, ownTasks] = context
    ? await Promise.all([
        db
          .select({ count: count() })
          .from(appointmentTable)
          .where(and(eq(appointmentTable.doctorUserId, userId), appointmentInClinic(context.clinic.id))),
        db
          .select({ count: count() })
          .from(taskTable)
          .where(
            and(
              eq(taskTable.assignedUserId, userId),
              eq(taskTable.status, "open"),
              eq(taskTable.clinicId, context.clinic.id),
            ),
          ),
      ])
    : [[{ count: 0 }], [{ count: 0 }]]

  const hasOwnWork = (ownAppointments[0]?.count ?? 0) > 0 || (ownTasks[0]?.count ?? 0) > 0

  // Staffing, sign-ups and system health across every clinic: the platform
  // owner's view, and only theirs. It used to open for anyone holding Team or
  // Roles, which showed one clinic's admin every other clinic's headcount and
  // contacts. A clinic admin still gets their own clinic's numbers from the
  // clinic block below.
  const runsThePlatform = unrestricted

  // Today's schedule and the newest contacts are an operational screen.
  //
  // Skipped for a caseload holder, who already has their own day above it, and
  // for an unrestricted account, whose job is the numbers rather than the day
  // — that is the whole reason superadmin has no Appointments page.
  //
  // An admin gets it, and that is not a contradiction: "runs the clinic day to
  // day" is the role's description. They administer *and* work the day, so
  // they get both, in that order.
  // Predict is a diagnosis business: no appointments, no courses. Its
  // dashboard is about blood tests, for everyone acting in it — superadmin
  // included — in place of the treatment clinic's day.
  const mods = context?.clinic.modules ?? null
  const predictView =
    Array.isArray(mods) && mods.includes("diagnosis") && !mods.includes("appointments") && !mods.includes("therapy")

  const showsClinic =
    !predictView && !hasOwnWork && !unrestricted && (held.has("clinic.appointments") || held.has("clinic.patients"))

  // The toggle only means something to someone who has a "mine" to switch to.
  const scope: "mine" | "all" =
    hasOwnWork && requestedScope === "all" ? "all" : hasOwnWork ? "mine" : "all"

  return (
    <div className="space-y-3 p-3 text-black sm:space-y-4 sm:p-4 lg:p-5 dark:text-white">
      <PageHeader
        title={`Welcome back, ${session.user.name}`}
        actions={
          hasOwnWork && (
            <div className="flex overflow-hidden rounded-md border border-black/18 text-xs dark:border-white/10">
              <ScopeLink current={scope} value="mine" label="Mine" />
              <ScopeLink current={scope} value="all" label="Everyone" />
            </div>
          )
        }
      />

      {hasOwnWork && (
        <ClinicalDay userId={userId} role={session.user.role} scope={scope} held={held} />
      )}

      {predictView && <PredictOverview />}

      {showsClinic && <ClinicOverview held={held} role={session.user.role} />}

      {runsThePlatform && (
        <PlatformOverview
          appointmentsPeriod={resolvePeriod(appointments)}
          contactsPeriod={resolvePeriod(contacts)}
        />
      )}
    </div>
  )
}

function ScopeLink({
  current,
  value,
  label,
}: {
  current: string
  value: "mine" | "all"
  label: string
}) {
  const active = current === value
  return (
    <Link
      href={`/dashboard?scope=${value}`}
      className={`px-2.5 py-1 font-medium transition-colors ${
        active
          ? "bg-black text-white dark:bg-white dark:text-black"
          : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
      }`}
    >
      {label}
    </Link>
  )
}

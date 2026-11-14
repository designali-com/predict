import { AppointmentReport } from "@/src/components/dashboard/reports/appointment-report"
import { LeadReport } from "@/src/components/dashboard/reports/lead-report"
import { ReportTabs } from "@/src/components/dashboard/reports/ui"
import { PeriodSelect } from "@/src/components/dashboard/overview/period-select"
import { periodStart, resolvePeriod } from "@/src/components/dashboard/overview/period"

/**
 * The reports the clinic is run from.
 *
 * Separate from the dashboard on purpose. A dashboard answers "what is
 * happening" in a glance and is read every morning; a report answers "how did
 * we do" over a window someone chooses, and is read when a decision is due.
 * Mixing them produces a page that is too slow to glance at and too shallow to
 * decide from.
 *
 * Two subjects, because they are two different decisions: the appointment book
 * is an operations question, and the lead funnel is a marketing one.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string }>
}) {
  const { tab, period: rawPeriod } = await searchParams
  const current = tab === "leads" ? "leads" : "appointments"
  // A report defaults to a month, not to today: a single day is noise at this
  // volume and no rate computed from it means anything.
  const period = resolvePeriod(rawPeriod === undefined ? "month" : rawPeriod)
  const since = periodStart(period)

  return (
    <div className="flex flex-col gap-6 p-4 text-black lg:p-6 dark:text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">Reports</h1>
        </div>
        <PeriodSelect param="period" value={period} />
      </div>

      <ReportTabs current={current} />

      {current === "leads" ? (
        <LeadReport period={period} since={since} />
      ) : (
        <AppointmentReport period={period} since={since} />
      )}
    </div>
  )
}

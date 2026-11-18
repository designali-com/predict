import { notFound } from "next/navigation"
import { requireAnyPermission } from "@/src/lib/auth/permissions"
import { canSeePatient } from "@/src/lib/auth/patient-scope"
import { valdReport, type ReportRange } from "@/src/lib/vald/report"
import { ValdReportView } from "@/src/components/dashboard/patients/vald-report-view"

const RANGES: ReportRange[] = ["day", "week", "all"]

/**
 * A strength report on its own page, outside the dashboard shell.
 *
 * Same reasoning as the receipt: this exists to be printed, and printing a page
 * that carries a sidebar means fighting the sidebar with print CSS in every
 * browser. Nothing is inherited here, so the permission is checked again.
 */
export default async function ValdReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ range?: string; day?: string }>
}) {
  await requireAnyPermission(["clinic.patients", "clinic.appointments", "clinic.biomarkers"])

  const { id } = await params
  if (!(await canSeePatient(id))) notFound()
  const { range, day } = await searchParams

  const chosen = RANGES.includes(range as ReportRange) ? (range as ReportRange) : "all"
  const report = await valdReport({ patientId: id, range: chosen, day })
  if (!report) notFound()

  return <ValdReportView report={JSON.parse(JSON.stringify(report))} />
}

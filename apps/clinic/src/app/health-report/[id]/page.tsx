import { notFound } from "next/navigation"
import { db } from "@workspace/db/client"
import { clinic, contact, patientRecord, report } from "@workspace/db/schema"
import { desc, eq, or } from "@workspace/db"
import { patientDashboard } from "@workspace/db/patient-dashboard"
import { requireAnyPermission } from "@/src/lib/auth/permissions"
import { canSeePatient } from "@/src/lib/auth/patient-scope"
import { HealthReportView, type HealthReportData } from "@/src/components/dashboard/patients/health-report-view"

/**
 * A patient's Predict health report — summary, biological age, domains and
 * every biomarker — on its own page, to print or save as a PDF.
 *
 * Outside the dashboard shell for the same reason as the receipt and the VALD
 * report: a page made to be printed should not carry a sidebar. Nothing is
 * inherited, so the permission and the patient are checked here. Predict may
 * print another clinic's patient it has tested (canSeePatient with diagnosis).
 */
export default async function HealthReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnyPermission(["clinic.patients", "clinic.biomarkers", "clinic.lab"])

  const { id } = await params
  if (!(await canSeePatient(id, { diagnosis: true }))) notFound()

  const [chart] = await db
    .select()
    .from(patientRecord)
    .where(or(eq(patientRecord.id, id), eq(patientRecord.contactId, id), eq(patientRecord.userId, id)))
    .limit(1)
  if (!chart) notFound()

  const [person] = chart.contactId
    ? await db
        .select({ clinicName: clinic.name, clinicShort: clinic.shortName, modules: clinic.modules })
        .from(contact)
        .leftJoin(clinic, eq(clinic.id, contact.clinicId))
        .where(eq(contact.id, chart.contactId))
        .limit(1)
    : []

  const dashboard = await patientDashboard(db, { userId: chart.userId, patientId: chart.id })

  const reports = await db
    .select({ fileName: report.fileName, reportType: report.reportType, collectedOn: report.collectedOn, uploadedAt: report.uploadedAt })
    .from(report)
    .where(chart.userId ? or(eq(report.patientId, chart.id), eq(report.userId, chart.userId)) : eq(report.patientId, chart.id))
    .orderBy(desc(report.uploadedAt))
    .limit(10)

  // Referred by: the patient's own clinic, when it is a treatment clinic
  // (Predict itself does not refer).
  const treating =
    person?.clinicName && !(person.modules ?? []).every((m) => m === "diagnosis") ? person.clinicShort || person.clinicName : null

  const data: HealthReportData = {
    patient: {
      name: [chart.firstName, chart.lastName].filter(Boolean).join(" ").trim() || dashboard.patient.name || "Patient",
      code: chart.patientCode,
      gender: chart.gender,
      dateOfBirth: chart.dateOfBirth ? String(chart.dateOfBirth) : null,
      referredBy: treating,
    },
    dashboard: JSON.parse(JSON.stringify(dashboard)),
    reports: reports.map((r) => ({
      fileName: r.fileName,
      reportType: r.reportType,
      collectedOn: r.collectedOn ? String(r.collectedOn) : null,
      uploadedAt: r.uploadedAt ? new Date(r.uploadedAt).toISOString() : null,
    })),
    generatedAt: new Date().toISOString(),
  }

  return <HealthReportView data={data} />
}

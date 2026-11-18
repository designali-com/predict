import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireAnyPermission } from "@/src/lib/auth/permissions"
import { canSeePatient } from "@/src/lib/auth/patient-scope"
import { PatientSummaryPanel } from "@/src/components/dashboard/patients/patient-summary-panel"

/**
 * The assessment summary on its own page, outside the dashboard shell —
 * opened by "Present" to turn the screen towards the patient, and by "Print"
 * (?print=1) so that only the summary reaches the printer.
 */

export const metadata: Metadata = { title: "Assessment summary" }

/**
 * Printed as it looks on screen — in dark mode the paper is dark. The page has
 * no printer margin; the 10mm comes from padding that repeats on every page
 * (box-decoration-break), so the background is one colour to the edge and no
 * content touches it.
 * Cards and rows are kept whole where they fit (break-inside: avoid, in the
 * view); one taller than a page breaks between its rows, never through one.
 */
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { background: var(--background) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* clone: the 10mm padding repeats at the top and bottom of every printed page. */
  .summary-page { min-height: 0 !important; padding: 10mm !important; background: var(--background) !important; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
}
`

export default async function SummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ print?: string }>
}) {
  await requireAnyPermission(["clinic.patients", "clinic.appointments"])
  const { id } = await params
  if (!(await canSeePatient(id))) notFound()
  const { print } = await searchParams

  return (
    <main className="summary-page min-h-screen bg-background p-3 sm:p-6">
      <style>{PRINT_CSS}</style>
      <div className="mx-auto max-w-6xl">
        <PatientSummaryPanel contactId={id} presenting autoPrint={print === "1"} />
      </div>
    </main>
  )
}

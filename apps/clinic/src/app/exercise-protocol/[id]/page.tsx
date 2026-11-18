import { notFound } from "next/navigation"
import { db } from "@workspace/db/client"
import { getExerciseProtocolPrint } from "@workspace/db/exercise-protocol-store"
import { ExerciseProtocolPrint } from "@workspace/ui/components/exercise-protocol-view"
import { requireAnyPermission } from "@/src/lib/auth/permissions"
import { canSeePatient } from "@/src/lib/auth/patient-scope"

/**
 * A patient's exercise prescription on its own page, outside the dashboard
 * shell, so only the prescription reaches the printer — same as the diet plan.
 */
export default async function ExerciseProtocolPrintPage({
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
  const data = await getExerciseProtocolPrint(db, id)
  if (!data) notFound()

  return (
    <ExerciseProtocolPrint
      protocol={data.protocol}
      patient={data.patient}
      clinic={data.clinic}
      savedAt={data.updatedAt}
      autoPrint={print === "1"}
    />
  )
}

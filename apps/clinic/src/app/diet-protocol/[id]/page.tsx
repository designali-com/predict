import { notFound } from "next/navigation"
import { db } from "@workspace/db/client"
import { getDietProtocolPrint } from "@workspace/db/diet-protocol-store"
import { DietProtocolPrint } from "@workspace/ui/components/diet-protocol-print"
import { requireAnyPermission } from "@/src/lib/auth/permissions"
import { canSeePatient } from "@/src/lib/auth/patient-scope"

/**
 * A patient's diet plan on its own page, outside the dashboard shell — same
 * reasoning as the receipt: it exists to be printed, and only the plan should
 * reach the printer. Nothing is inherited, so the permission is checked here.
 */
export default async function DietProtocolPrintPage({
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
  const data = await getDietProtocolPrint(db, id)
  if (!data) notFound()

  return (
    <DietProtocolPrint
      protocol={data.protocol}
      patient={data.patient}
      clinic={data.clinic}
      savedAt={data.updatedAt}
      autoPrint={print === "1"}
    />
  )
}

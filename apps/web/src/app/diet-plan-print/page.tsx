import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { db } from "@workspace/db/client"
import { contact, patientRecord } from "@workspace/db/schema"
import { eq } from "@workspace/db"
import { getDietProtocolPrint } from "@workspace/db/diet-protocol-store"
import { DietProtocolPrint } from "@workspace/ui/components/diet-protocol-print"
import { auth } from "@/src/lib/auth/auth"

/**
 * The signed-in patient's diet plan as a printable sheet, outside the
 * dashboard shell so only the plan reaches the printer. Always their own: the
 * contact comes from the session, never from the URL.
 */
export default async function DietPlanPrintPage({ searchParams }: { searchParams: Promise<{ print?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const chart = await db.query.patientRecord.findFirst({ where: eq(patientRecord.userId, session.user.id) })
  const contactId =
    chart?.contactId ??
    (await db.query.contact.findFirst({ columns: { id: true }, where: eq(contact.userId, session.user.id) }))?.id ??
    null
  const data = contactId ? await getDietProtocolPrint(db, contactId) : null
  if (!data) notFound()

  const { print } = await searchParams
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

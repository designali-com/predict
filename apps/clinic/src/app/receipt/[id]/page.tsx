import { notFound } from "next/navigation"
import { db } from "@workspace/db/client"
import { receiptFor } from "@workspace/db/receipt"
import { isPartnerClinic } from "@workspace/db/clinic-service"
import { requirePermission } from "@/src/lib/auth/permissions"
import { clinicContext } from "@/src/lib/auth/clinic"
import { ReceiptView } from "@/src/components/dashboard/billing/receipt-view"

/**
 * A receipt on its own page, outside the dashboard shell.
 *
 * Deliberately not inside (dashboard): a receipt is printed, and printing a
 * page that has a sidebar means fighting the sidebar with print CSS on every
 * browser. Nothing is inherited, so the permission is checked here too — the
 * same one that guards taking the money in the first place. And only the
 * active clinic's receipts: another clinic's id reads as no such page.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("clinic.billing")

  const context = await clinicContext()
  if (!context) notFound()

  const { id } = await params
  const receipt = await receiptFor(db, id, {
    clinicId: context.clinic.id,
    unplaced: !isPartnerClinic(context.clinic),
  })
  if (!receipt) notFound()

  return <ReceiptView receipt={JSON.parse(JSON.stringify(receipt))} />
}

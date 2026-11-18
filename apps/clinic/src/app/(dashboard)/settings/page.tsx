import { PageHeader } from "@workspace/ui/components/page-header"
import { requirePermission } from "@/src/lib/auth/permissions"
import { ClinicDetails } from "@/src/components/dashboard/billing/clinic-details"

/**
 * The clinic's settings — for admins. For now its details as they print on
 * receipts and reports (name, address, GSTIN, registration number, footer),
 * which used to sit on the Billing page in front of everyone who takes money.
 */
export default async function SettingsPage() {
  await requirePermission("clinic.settings")
  return (
    <div className="flex w-full flex-col gap-3 p-3 lg:p-4">
      <PageHeader title="Settings" description="Clinic details as they print on receipts, bills and reports." />
      <ClinicDetails />
    </div>
  )
}

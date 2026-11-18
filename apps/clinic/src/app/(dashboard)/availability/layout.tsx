import type { Metadata } from "next"
import { requirePermission } from "@/src/lib/auth/permissions"

export const metadata: Metadata = {
  title: "Availability",
}

// A clinician maintains their own calendar. The front desk can edit somebody
// else's via the API when a doctor phones in sick — see resolveTarget.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermission("clinic.availability")
  return <>{children}</>
}

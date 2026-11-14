import type { Metadata } from "next"
import { requirePermission } from "@/src/lib/auth/permissions"

export const metadata: Metadata = {
  title: "Billing",
}

// Its own permission: whoever takes money is also who can see an unpaid visit,
// which is what the fee gate keys on.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermission("clinic.billing")
  return <>{children}</>
}

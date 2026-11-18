import type { Metadata } from "next"
import { requirePermission } from "@/src/lib/auth/permissions"

export const metadata: Metadata = {
  title: "Stock",
}

// Counting stock is a different job from prescribing it, so it has its own
// permission — often held by neither the doctor nor the front desk.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermission("clinic.stock")
  return <>{children}</>
}

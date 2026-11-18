import type { Metadata } from "next"
import { requirePermission } from "@/src/lib/auth/permissions"

export const metadata: Metadata = {
  title: "Therapy calendar",
}

// The front desk's page: it holds clinic.schedule, as does anyone who books.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermission("clinic.schedule")
  return <>{children}</>
}

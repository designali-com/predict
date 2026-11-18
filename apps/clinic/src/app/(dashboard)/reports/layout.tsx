import type { Metadata } from "next"
import { requirePermission } from "@/src/lib/auth/permissions"

export const metadata: Metadata = {
  title: "Reports",
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermission("clinic.reports")
  return <>{children}</>
}

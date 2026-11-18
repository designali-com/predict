import type { Metadata } from "next"
import { requirePermission } from "@/src/lib/auth/permissions"

export const metadata: Metadata = {
  title: "Treatment Plans",
}

// Its own permission, like the care plan library: pricing and packaging is a
// job somebody owns, and handing it over should not also hand over the rest of
// Administration.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermission("clinic.treatment_plans")
  return <>{children}</>
}

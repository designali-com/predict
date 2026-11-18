import type { Metadata } from "next"
import { requirePermission } from "@/src/lib/auth/permissions"

export const metadata: Metadata = {
  title: "Care Plan Library",
}

// Its own permission, so it can be handed to whoever a clinic wants running
// it — admin by default, a particular nutritionist from their own profile —
// without that also granting the rest of Administration.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermission("clinic.care_plan_library")
  return <>{children}</>
}

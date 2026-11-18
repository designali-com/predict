import type { Metadata } from "next"
import { requirePermission } from "@/src/lib/auth/permissions"

export const metadata: Metadata = {
  title: "Schedule",
}

// Its own check. The panel layout admits anyone with any clinic page; the
// sidebar hides a link, it does not close a door.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermission("clinic.schedule")
  return <>{children}</>
}

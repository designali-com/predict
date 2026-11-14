import type { Metadata } from "next"
import { requirePermission } from "@/src/lib/auth/permissions"

export const metadata: Metadata = {
  title: "AI",
}

// The panel's layout admits anyone with any clinic page; this is this page's
// own check. Both are needed — the sidebar hides a link, it does not close a
// door.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermission("clinic.ai")
  return <>{children}</>
}

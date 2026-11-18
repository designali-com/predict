import { PermissionGate } from "@/src/components/permission-gate"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Settings",
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PermissionGate permission="ops.automation_settings">{children}</PermissionGate>
}

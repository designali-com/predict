import { PermissionGate } from "@/src/components/permission-gate"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Lead Routing",
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PermissionGate permission="ops.lead_routing">{children}</PermissionGate>
}

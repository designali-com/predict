import type { Metadata } from "next"
import { PermissionGate } from "@/src/components/permission-gate"

export const metadata: Metadata = {
  title: "Leads",
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PermissionGate permission="ops.leads">{children}</PermissionGate>
}

import type { Metadata } from "next"
import { PermissionGate } from "@/src/components/permission-gate"

export const metadata: Metadata = {
  title: "Call queue",
}

// Same door as the Leads page: anyone who may work leads may work the queue.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PermissionGate permission="ops.leads">{children}</PermissionGate>
}

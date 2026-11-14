import type { Metadata } from "next"
import { PermissionGate } from "@/src/components/permission-gate"

export const metadata: Metadata = {
  title: "Stock",
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PermissionGate permission="ops.media">{children}</PermissionGate>
}

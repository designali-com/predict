import type { Metadata } from "next"
import { PermissionGate } from "@/src/components/permission-gate"

export const metadata: Metadata = {
  title: "Templates",
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PermissionGate permission="ops.templates">{children}</PermissionGate>
}

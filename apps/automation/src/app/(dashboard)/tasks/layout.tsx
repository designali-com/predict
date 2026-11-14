import type { Metadata } from "next"
import { PermissionGate } from "@/src/components/permission-gate"

export const metadata: Metadata = {
  title: "Tasks",
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PermissionGate permission="ops.tasks">{children}</PermissionGate>
}

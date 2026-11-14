import type { Metadata } from "next"
import { PermissionGate } from "@/src/components/permission-gate"

export const metadata: Metadata = {
  title: "Contacts",
}

/**
 * /contacts is no longer a list — it is one person's record, opened from
 * either Leads or Patients. Holding either list is enough to get past this
 * gate; which of the two that record actually belongs to is checked one level
 * down, in [id]/layout.tsx, where the stage is known.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PermissionGate permission={["ops.leads", "ops.patients"]}>{children}</PermissionGate>
}

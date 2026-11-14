import type { Metadata } from "next"
import { requireAnyPermission } from "@/src/lib/auth/permissions"

export const metadata: Metadata = {
  title: "People",
}

// One person's record, reached from Patients or from Team — so holding either
// list is enough. It is not a sidebar entry and therefore not its own
// permission; the two lists are the doors.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAnyPermission([
    "clinic.patients",
    "clinic.team",
    "clinic.schedule",
    // Appointments link through to whoever the appointment is with.
    "clinic.appointments",
  ])
  return <>{children}</>
}

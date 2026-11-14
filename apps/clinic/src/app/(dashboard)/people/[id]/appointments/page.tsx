"use client"

import { AppointmentList } from "@/src/components/dashboard/superadmin/appointments/appointment-list"
import { use } from "react"

export default function SuperadminPatientAppointmentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  return <AppointmentList patientId={id} />
}

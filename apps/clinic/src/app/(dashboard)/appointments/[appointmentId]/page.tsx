import { AppointmentDetail } from "@/src/components/dashboard/superadmin/appointments/appointment-detail"

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>
}) {
  const { appointmentId } = await params
  return <AppointmentDetail appointmentId={appointmentId} />
}

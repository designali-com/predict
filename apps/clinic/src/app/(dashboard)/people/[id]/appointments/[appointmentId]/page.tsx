import { AppointmentDetail } from "@/src/components/dashboard/superadmin/appointments/appointment-detail"

export default async function PersonAppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; appointmentId: string }>
}) {
  const { appointmentId } = await params
  return <AppointmentDetail appointmentId={appointmentId} />
}

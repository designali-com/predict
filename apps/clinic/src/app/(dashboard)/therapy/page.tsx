import { PageHeader } from "@workspace/ui/components/page-header"
import { TherapyCalendar } from "@/src/components/dashboard/therapy/therapy-calendar"

/**
 * Therapy by the hour: how many places each hour has left, who is booked, and
 * the place to log a sitting — signed — when the patient is treated.
 */
export default function TherapyPage() {
  return (
    <div className="flex w-full flex-col gap-3 p-3 lg:p-4">
      <PageHeader title="Therapy calendar" />
      <TherapyCalendar />
    </div>
  )
}

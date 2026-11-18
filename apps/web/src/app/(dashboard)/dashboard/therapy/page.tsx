import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/src/lib/auth/auth"
import { patientHasTherapy } from "@/src/lib/therapy-access"
import { TherapyLog } from "@/src/components/dashboard/user/therapy/therapy-log"

/**
 * The patient's therapy — only once there is some.
 *
 * A course shows up here when the doctor has prescribed it at a consult AND
 * the patient has bought it. Before that there is nothing to show, so the page
 * is not in the menu and an old link to it goes back to the dashboard rather
 * than to an empty screen about treatment they do not have.
 */
export default async function TherapyPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || !(await patientHasTherapy(session.user.id))) {
    redirect("/dashboard")
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-4 bg-transparent p-4 md:gap-6 md:p-6">
      <div className="mb-4 max-w-3xl md:mb-4">
        <h1 className="text-xl font-medium tracking-tight md:text-2xl">My Therapy</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your course, day by day. Tick the days you do at home — the clinic records the days you come in.
        </p>
      </div>
      <TherapyLog />
    </div>
  )
}

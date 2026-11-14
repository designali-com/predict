import { PageHeader } from "@workspace/ui/components/page-header"
import { ClinicTeam } from "@workspace/ui/components/clinic-team"

/**
 * This clinic's team — only the people who work here, in the role they hold
 * here. The same component the operations console shows for a clinic, so an
 * admin here and a superadmin there see and do exactly the same thing.
 *
 * A superadmin opens a clinic and makes its admin; from then on the admin
 * runs the team from this page.
 */
export default function TeamPage() {
  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader title="Team" />
      <ClinicTeam
        apiBase="/api/staff/team"
        note="The role is for this clinic only — the same person can hold a different role at another clinic. What each role can do is set on the Roles page."
      />
    </div>
  )
}

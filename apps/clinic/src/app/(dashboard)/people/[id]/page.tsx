import { db } from "@workspace/db/client"
import { user } from "@workspace/db/schema"
import { eq } from "@workspace/db"
import { resolveRole } from "@workspace/db/roles"
import { UserDetailView } from "@/src/components/dashboard/superadmin/users/user-detail-view"
import { PatientRecordView } from "@/src/components/dashboard/patients/patient-record-view"

/**
 * One person, whichever kind of id got us here.
 *
 * This page is reached from Patients (a contact id), from Team (a user id) and
 * from an appointment (a contact id). It used to assume a user id, which is why
 * the clinic panel could not open a walk-in: they have a chart and a contact
 * and no account at all.
 *
 * A staff member is looked up first because their id is unambiguous and their
 * page is a different thing — permissions, role, account status. Anything else
 * is a patient record, keyed on the contact every patient has.
 */
export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [account] = await db.select({ role: user.role }).from(user).where(eq(user.id, id)).limit(1)

  // A patient account still gets the patient record: the chart is the point,
  // and it reads the same whether they signed up or walked in.
  if (account && resolveRole(account.role) !== "patient" && resolveRole(account.role) !== "user") {
    return <UserDetailView id={id} />
  }

  return <PatientRecordView id={id} />
}

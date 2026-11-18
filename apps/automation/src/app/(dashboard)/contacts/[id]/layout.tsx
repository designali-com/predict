import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@workspace/db/client"
import { contact } from "@workspace/db/schema"
import { eq } from "@workspace/db"
import { can } from "@workspace/db/permission-service"
import { permissionForStage, sideForStage, SIDE_META } from "@workspace/db/contact-side"
import { auth } from "@/src/lib/auth/auth"
import { canSeeLead, leadScope } from "@/src/lib/lead-access"

/**
 * The record itself is gated, not just the list it was opened from.
 *
 * Splitting People into Leads and Patients would be theatre if a lead-desk
 * agent could still reach a patient's medical tab by knowing the id — and they
 * would, because ids turn up in campaign reports, task links and audience
 * pages. So the stage is read here and checked against the permission for the
 * list that person is actually on.
 *
 * They are sent back to whichever list they can see rather than to /home: the
 * usual way to arrive here without access is a link on a page they do have,
 * and the useful answer is "not this one", not a blank dashboard.
 */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  const { id } = await params
  const [row] = await db
    .select({ stage: contact.stage })
    .from(contact)
    .where(eq(contact.id, id))
    .limit(1)

  // A contact that does not exist is the page's own 404 to render, not a
  // permission problem to redirect over.
  if (!row) return <>{children}</>

  if (!(await can(db, session.user, permissionForStage(row.stage)))) {
    const other = sideForStage(row.stage) === "leads" ? "patients" : "leads"
    redirect((await can(db, session.user, SIDE_META[other].permission))
      ? SIDE_META[other].route
      : "/home")
  }

  // A telecaller sees their own leads only — an id in a URL must not open
  // anybody else's.
  if (sideForStage(row.stage) === "leads" && !(await canSeeLead(await leadScope(session.user), id))) {
    redirect("/leads")
  }

  return <>{children}</>
}

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@workspace/db/client"
import { can, canAny } from "@workspace/db/permission-service"
import { auth } from "@/src/lib/auth/auth"

/**
 * Server-side gate for one page, keyed on a permission rather than a role.
 *
 * The sidebar already hides what a role cannot reach, but a hidden link is not
 * an access control — every route here is reachable by typing it. The matching
 * API routes check the same permission on their own, so neither layer is
 * trusting the other.
 *
 * Redirects to /home rather than /login: the person IS signed in and does
 * belong in this console, just not on this screen. Bouncing them to a login
 * form would read as a broken session.
 *
 * An array means any one of them is enough — for a route that more than one
 * kind of person legitimately reaches, like a contact record that both the
 * lead desk and the care team open.
 */
export async function PermissionGate({
  permission,
  children,
}: {
  permission: string | string[]
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  const allowed = Array.isArray(permission)
    ? await canAny(db, session.user, permission)
    : await can(db, session.user, permission)

  // /home rather than /login: they ARE signed in and do belong in this
  // console, just not on this screen.
  if (!allowed) redirect("/home")
  return <>{children}</>
}

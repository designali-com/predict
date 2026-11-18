import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { ShieldOff } from "lucide-react"
import { auth } from "@/src/lib/auth/auth"
import { db } from "@workspace/db/client"
import { grantedPermissions } from "@workspace/db/permission-service"
import { getRole } from "@workspace/db/role-service"

/**
 * Signed in, but the role holds no page here yet.
 *
 * This exists because the alternative was worse in both directions: sending
 * them to the patient app told them they were a patient, and sending them to a
 * page they cannot open put them in a redirect loop. A newly created role has
 * no pages until someone grants them, so this is a normal state for a day, not
 * an error.
 */
export default async function NoAccessPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  // If they have since been granted something, there is nothing to explain.
  const held = await grantedPermissions(db, session.user)
  if (held.length) redirect("/")

  const role = await getRole(db, session.user.role ?? "")

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-border p-6">
        <ShieldOff className="mb-3 h-6 w-6 text-muted-foreground" />
        <h1 className="text-lg font-semibold">No pages yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are signed in as <strong>{session.user.name}</strong>
          {role ? (
            <>
              {" "}
              with the <strong>{role.label}</strong> role
            </>
          ) : null}
          , but that role has not been given any pages here.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          An administrator can grant them from <strong>Roles</strong> in the clinic panel — either
          for the whole role, or for you alone from your profile.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
        >
          Sign in as someone else
        </Link>
      </div>
    </main>
  )
}

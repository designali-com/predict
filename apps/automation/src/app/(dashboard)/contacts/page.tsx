import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@workspace/db/client"
import { grantedPermissions } from "@workspace/db/permission-service"
import { SIDE_META, sidesFor } from "@workspace/db/contact-side"
import { auth } from "@/src/lib/auth/auth"

/**
 * The old People list. It is now two lists, so this only decides which one to
 * open — kept because bookmarks, saved links and older emails point here, and
 * a 404 on a page somebody used every day is a bad way to learn about a
 * rename.
 *
 * Somebody who holds both lands on Leads: it is the busier of the two and the
 * one with a queue attached to it.
 */
export default async function ContactsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  const sides = sidesFor(await grantedPermissions(db, session.user))
  redirect(sides.length ? SIDE_META[sides[0]!].route : "/home")
}

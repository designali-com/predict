import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/src/lib/auth/auth"
import { panelRedirectFor } from "@/src/lib/auth/permissions"

/**
 * There is no landing page here — the clinic panel has no anonymous surface.
 * Signed in, you go to whichever area your role actually works in (which may
 * be a different app entirely); signed out, you go to the login form.
 */
export default async function RootPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  redirect(session ? await panelRedirectFor(session.user) : "/auth/login")
}

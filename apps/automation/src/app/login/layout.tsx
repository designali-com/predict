import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/src/lib/auth/auth"
import { panelRedirectFor } from "@/src/lib/auth/panel"

export const metadata: Metadata = {
  title: "Sign in",
}

/**
 * Someone already signed in has no business on a login form — send them
 * wherever their grants actually put them, which may be another app.
 *
 * The check lives in a layout because the page itself is a client component,
 * and resolving this needs the database.
 */
export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session) redirect(await panelRedirectFor(session.user))
  return <>{children}</>
}

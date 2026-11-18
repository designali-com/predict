import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/src/lib/auth/auth"
import { panelRedirectFor } from "@/src/lib/auth/panel"

export default async function RootPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  redirect(session ? await panelRedirectFor(session.user) : "/login")
}

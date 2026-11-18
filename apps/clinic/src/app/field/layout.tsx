import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@workspace/db/client"
import { can } from "@workspace/db/permission-service"
import { Toaster } from "@workspace/ui/components/sonner"
import { auth } from "@/src/lib/auth/auth"
import { FieldHeader } from "@/src/components/lab/field-header"

export const metadata = { title: "My visits | Predict Lab" }

/**
 * A field technician's page — our staff or an agency's: the visits assigned
 * to them and the buttons to update them. A phone screen, nothing else.
 * Opens on lab.predict.fit/field.
 */
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")
  if (!(await can(db, session.user, "clinic.field"))) redirect("/no-access")
  return (
    <div className="min-h-svh bg-gradient-to-b from-primary/5 via-primary/5 to-background">
      <FieldHeader userName={session.user.name} />
      <main className="mx-auto w-full max-w-xl p-3">{children}</main>
      <Toaster position="top-center" richColors closeButton />
    </div>
  )
}

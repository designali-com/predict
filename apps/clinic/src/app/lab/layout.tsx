import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@workspace/db/client"
import { can } from "@workspace/db/permission-service"
import { auth } from "@/src/lib/auth/auth"
import { Toaster } from "@workspace/ui/components/sonner"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { requirePermission } from "@/src/lib/auth/permissions"
import { LAB_URL } from "@/src/lib/auth/config"
import { LabBaseProvider } from "@/src/components/lab/lab-base"
import { LabSidebar } from "@/src/components/lab/lab-sidebar"
import { LabSiteHeader } from "@/src/components/lab/lab-site-header"

export const metadata = { title: { default: "Predict Lab", template: "%s | Predict Lab" } }

/** Whether this request came in on the lab's own host (lab.predict.fit). */
async function onLabHost(): Promise<boolean> {
  if (!LAB_URL) return false
  const h = await headers()
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]!.trim()
  try {
    return host === new URL(LAB_URL).host
  } catch {
    return false
  }
}

/**
 * The lab (lab.predict.fit): blood-test orders from every clinic and partner
 * hospital, worked through collection, payment and report. The clinic's own
 * shell — same sidebar, header, cards and buttons — with only the lab in it.
 */
export default async function LabLayout({ children }: { children: React.ReactNode }) {
  const labHost = await onLabHost()
  // On the clinic's host a refusal goes wherever this person does work. On the
  // lab's host that would bounce straight back here (the proxy sends every
  // other page to the lab), so it is a plain "no access" instead.
  let session
  if (labHost) {
    session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect("/auth/login")
    if (!(await can(db, session.user, "clinic.lab"))) {
      // A field technician signs in at the lab's front door too: their page.
      redirect((await can(db, session.user, "clinic.field")) ? "/field" : "/no-access")
    }
  } else {
    session = await requirePermission("clinic.lab")
  }
  // On lab.predict.fit the pages sit at the root; on the clinic's host under /lab.
  const base = labHost ? "" : "/lab"

  return (
    <LabBaseProvider base={base}>
      <SidebarProvider
        defaultOpen={false}
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 56)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <LabSidebar variant="inset" />
        <SidebarInset className="border bg-gradient-to-b from-primary/5 via-primary/5 to-background">
          <LabSiteHeader userName={session.user.name} />
          <div className="flex flex-1 flex-col p-3 sm:p-4 lg:p-5">{children}</div>
        </SidebarInset>
        <Toaster position="top-right" richColors closeButton />
      </SidebarProvider>
    </LabBaseProvider>
  )
}

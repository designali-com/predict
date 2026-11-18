import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/src/lib/auth/auth"
import { db } from "@workspace/db/client"
import { canAny } from "@workspace/db/permission-service"
import { panelRedirectFor, sessionNavPermissions } from "@/src/lib/auth/permissions"
import { CLINIC_KEYS } from "@workspace/db/permissions"
import { AppSidebar } from "@/src/components/dashboard/app-sidebar"
import { clinicContext } from "@/src/lib/auth/clinic"
import { PERMISSION_MODULE, clinicModules } from "@workspace/db/clinic-modules"
import { SiteHeader } from "@/src/components/dashboard/user/site-header"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { Toaster } from "@workspace/ui/components/sonner"

/**
 * The whole clinic panel: one gate, one shell.
 *
 * There used to be four shells, one per role-shaped area, each with its own
 * sidebar — so which navigation you saw was decided by which folder you were
 * in rather than by what you had been granted. Holding any clinic page opens
 * the panel; each page below still checks its own.
 */
export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) redirect("/auth/login")

  // Someone who belongs in another panel entirely gets sent there, rather than
  // to a login form that would only sign them in again.
  if (!(await canAny(db, session.user, CLINIC_KEYS))) {
    redirect(await panelRedirectFor(session.user))
  }

  const permissions = await sessionNavPermissions()
  // The clinic signed in to: its name and logo head the sidebar, its colour
  // is the panel accent.
  const clinic = (await clinicContext())?.clinic
  const brand = clinic
    ? { name: clinic.shortName || clinic.name, logoUrl: clinic.logoUrl, logoDarkUrl: clinic.logoDarkUrl }
    : null

  return (
    <SidebarProvider
      defaultOpen={false}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 56)",
          "--header-height": "calc(var(--spacing) * 12)",
          ...(clinic?.brandColor ? { "--primary": clinic.brandColor, "--sidebar-primary": clinic.brandColor } : {}),
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" permissions={permissions} brand={brand} modules={clinic ? [...navModules(clinic, permissions)] : null} />
      {/*
        The inset card already has an 8px margin on desktop. A min-height of
        the full screen on top of that margin made the shell a few pixels
        taller than the window, so every page showed a slight vertical
        scrollbar. Flex stretch fills a short page; a long page still grows.
      */}
      <SidebarInset className="border bg-gradient-to-b from-primary/5 via-primary/5 to-background">
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
      {/* Saved / couldn't save / added — every page's confirmations pop up here. */}
      <Toaster position="top-right" richColors closeButton />
    </SidebarProvider>
  )
}

/**
 * The modules whose links show. A Diagnosis permission still held after the
 * module filter means Predict's own staff (superadmin, the lab), who keep
 * Diagnosis in any clinic — so its links (Lab, Biomarkers) show for them too.
 */
function navModules(clinic: { modules?: string[] | null }, permissions: string[]) {
  const on = clinicModules(clinic)
  if (permissions.includes("clinic.lab") || permissions.some((p) => PERMISSION_MODULE[p] === "diagnosis")) on.add("diagnosis")
  return on
}

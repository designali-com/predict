import { headers } from "next/headers"
import { clinicModules } from "@workspace/db/clinic-modules"
import { redirect } from "next/navigation"
import { db } from "@workspace/db/client"
import { canAny, grantedPermissions } from "@workspace/db/permission-service"
import { OPS_KEYS } from "@workspace/db/permissions"
import { auth } from "@/src/lib/auth/auth"
import { panelRedirectFor } from "@/src/lib/auth/panel"
import { clinicContext } from "@/src/lib/auth/clinic"
import { SidebarNav } from "@/src/components/sidebar-nav"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@workspace/ui/components/sidebar"
import { Toaster } from "@workspace/ui/components/sonner"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth.api.getSession({ headers: await headers() })

  // Two different situations that used to share one answer. Someone signed
  // out needs the login form; someone signed in without any operations page
  // needs the panel they *do* belong to — sending them to /login would just
  // sign them in again and bounce them straight back here.
  if (!session) redirect("/login")
  if (!(await canAny(db, session.user, OPS_KEYS))) {
    redirect(await panelRedirectFor(session.user))
  }

  // Resolved once here and handed down, rather than every nav entry asking the
  // same question. Each page behind these links checks its own permission
  // server-side as well — hiding a link is not an access control.
  const permissions = await grantedPermissions(db, session.user)

  // The clinic signed in to: its logo heads the sidebar and its colour runs
  // through the console, so a clinic's admin sees their own brand here as in
  // the clinic panel. Switching clinic reloads, so this follows the switch.
  const clinic = (await clinicContext().catch(() => null))?.clinic
  const brand = clinic
    ? { name: clinic.shortName || clinic.name, logoUrl: clinic.logoUrl, logoDarkUrl: clinic.logoDarkUrl }
    : null

  // The same shell as the clinic panel: shared sidebar, tokenised surfaces, a
  // header that can collapse it. The hand-rolled <aside> this replaces was a
  // fixed black column with no collapse and no mobile behaviour, and it drifted
  // from the clinic's sidebar every time either was touched.
  return (
    <SidebarProvider
      defaultOpen
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 60)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      {/* The clinic's colour on the whole document, not just this wrapper:
          dialogs, menus and filter popovers render in a portal outside it and
          stayed the default purple. Light and dark both. */}
      {clinic?.brandColor && /^#[0-9a-fA-F]{3,8}$/.test(clinic.brandColor) && (
        <style>{`html:root, html.dark { --primary: ${clinic.brandColor}; --sidebar-primary: ${clinic.brandColor}; --ring: ${clinic.brandColor}; --primary-foreground: #ffffff; }`}</style>
      )}
      <SidebarNav variant="inset" permissions={permissions} brand={brand} modules={clinic ? [...clinicModules(clinic)] : null} />
      {/* From md the inset sits 0.5rem in from every edge; min-h-svh on top of
          that margin made every page scroll by 1rem for nothing. */}
      <SidebarInset className="min-h-svh min-w-0 border bg-background md:min-h-[calc(100svh-1rem)]">
        <header className="flex h-(--header-height) shrink-0 items-center gap-3 border-b px-3">
          <SidebarTrigger />
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 lg:p-6">{children}</div>
      </SidebarInset>
      {/* One place every page's "Saved" / "Couldn't save" / "New message" pops up. */}
      <Toaster position="top-right" richColors closeButton />
    </SidebarProvider>
  )
}

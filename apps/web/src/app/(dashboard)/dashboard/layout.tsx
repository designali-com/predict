import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/src/lib/auth/auth"
import { isStaffPrincipal, panelRedirectFor } from "@/src/lib/auth/panel"

import { AppSidebar } from "@/src/components/dashboard/user/app-sidebar"
import { patientHasTherapy } from "@/src/lib/therapy-access"
import { SiteHeader } from "@/src/components/dashboard/user/site-header"
import {
    SidebarInset,
    SidebarProvider,
} from "@workspace/ui/components/sidebar"


export default async function DashboardLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/login")
    }

    // This app is the patient's product; every staff role now works in another
    // panel entirely. A staff account signing in here is sent to whichever one
    // that is, rather than shown a dashboard with no data for them.
    //
    // "Staff" is decided by what the account holds, not by whether the code
    // recognises its role name — a role created from the Roles page is just as
    // much staff as a built-in one.
    if (await isStaffPrincipal(session.user)) {
        redirect(await panelRedirectFor(session.user))
    }

    return (
        <div>
            <SidebarProvider
                defaultOpen={false}
                style={
                    {
                        "--sidebar-width": "calc(var(--spacing) * 64)",
                        "--header-height": "calc(var(--spacing) * 12)",
                    } as React.CSSProperties
                }
            >
                <AppSidebar variant="inset" session={session} showTherapy={await patientHasTherapy(session.user.id)} />
                <SidebarInset className="bg-gradient-to-b border from-primary/05 via-primary/5 to-background">
                    <SiteHeader session={session} />
                    {children}
                </SidebarInset>
            </SidebarProvider>
        </div>
    )
}


"use client"
import type { auth } from "@/src/lib/auth/auth";
import { authClient } from "@/src/lib/auth/auth-client";
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { NavHeader } from "../../layout/navbar"

type SessionData = Awaited<ReturnType<typeof auth.api.getSession>>

interface SiteHeaderProps {
  // Pass the server-resolved session down when the caller already has one
  // (e.g. the dashboard layout) to avoid a redundant client-side session
  // fetch. Falls back to fetching client-side when omitted.
  session?: NonNullable<SessionData>
}

export function SiteHeader({ session }: SiteHeaderProps = {}) {
  if (session !== undefined) {
    return <SiteHeaderContent session={session} />
  }
  return <SiteHeaderWithClientSession />
}

function SiteHeaderWithClientSession() {
  const { data: session } = authClient.useSession();
  return <SiteHeaderContent session={session} />
}

function SiteHeaderContent({ session }: { session: SessionData }) {
  const name = session?.user?.name ?? "User";

  const now = new Date();
  const hour = now.getHours();

  const greeting =
    hour < 12
      ? "Good Morning"
      : hour < 17
        ? "Good Afternoon"
        : "Good Evening";

  const date = now.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex h-6 w-full min-w-0 items-center gap-1 px-2 lg:gap-2">
        <SidebarTrigger className="" />
        <Separator
          orientation="vertical"
        />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Greeting and date only where there is room — on a phone the page itself greets. */}
          <div className="ml-auto hidden w-full items-center justify-between text-right md:flex">
            <h2 className="text-md ml-2 font-medium">
               {greeting}, {name}.
            </h2>
            <p className="hidden text-sm text-muted-foreground lg:block">{date}</p>
          </div>
          <div className="ml-auto ">
            <NavHeader />
          </div>
        </div>
      </div>
    </header>
  )
}

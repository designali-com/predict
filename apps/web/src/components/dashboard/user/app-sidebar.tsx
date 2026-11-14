"use client"
import { Button } from "@workspace/ui/components/button"

import * as React from "react"
import type { auth } from "@/src/lib/auth/auth"

import {
  LayoutDashboard,
  Activity,
  FlaskConical,
  Clock3,
  CalendarDays,
  TriangleAlert,
  HeartPulse,
  Settings,
  User,
  Settings2,
  X,
} from "lucide-react";

import { NavMain } from "./nav-main"
import { NavUser } from "./nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import Link from "next/link"
import {Logo} from "../../logo"
import { PredictMark } from "../../predict-loader"
import { usePathname } from "next/navigation"

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Predict AI",
      url: "/dashboard/ai",
      icon: PredictMark,
    }, 
    {
      title: "Biomarkers",
      url: "/dashboard/biomarker",
      icon: FlaskConical,
    },
    {
      title: "Biological Age",
      url: "/dashboard/biological-age",
      icon: Clock3,
    },
    {
      title: "Biological Clock",
      url: "/dashboard/biological-clock",
      icon: Clock3,
    },
    {
      title: "Appointments",
      url: "/dashboard/appointments",
      icon: CalendarDays,
    }, 
    {
      title: "My Therapy",
      url: "/dashboard/therapy",
      icon: Activity,
    },
    {
      title: "Profile",
      url: "/dashboard/profile",
      icon: User,
    },
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: Settings2,
    }, 
  ],
};

type SessionData = Awaited<ReturnType<typeof auth.api.getSession>>

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  // Passed down from the server-rendered dashboard layout to avoid a
  // redundant client-side session fetch in NavUser.
  session?: NonNullable<SessionData>
  /** Whether the patient has a bought therapy course — decided by the layout, on the server. */
  showTherapy?: boolean
}

export function AppSidebar({ session, showTherapy = false, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  // My Therapy only for a patient with a course they have bought — prescribed
  // at a consult AND paid for. Before that it is an empty page about treatment
  // they do not have.
  const navMain = data.navMain
    .filter((item) => item.url !== "/dashboard/therapy" || showTherapy)
    .map((item) => ({
      ...item,
      isActive:
        pathname === item.url || pathname.startsWith(`${item.url}/`),
    }));

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="bg-background">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center justify-between">
            <Link href="/" className="flex h-12 items-center px-3">
              <Logo className="h-32 w-auto" />
            </Link>
            {/* On a phone the sidebar covers the page and the shared
                component hides its own close button, which left tapping
                outside it as the only way out — not something anybody finds. */}
            {isMobile && (
              <Button variant="ghost" size="icon"
 type="button"
 onClick={() => setOpenMobile(false)}
 aria-label="Close menu"
 className="mr-1 flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
 >
                <X className="h-5 w-5" />
              </Button>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="bg-background">
        <NavMain items={navMain} />
      </SidebarContent>

      <SidebarFooter className="bg-background">
        <NavUser session={session} />
      </SidebarFooter>
    </Sidebar>
  );
}
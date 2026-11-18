"use client"

import { Button } from "@workspace/ui/components/button"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { NAV_MODULE, type ClinicModule } from "@workspace/db/clinic-modules"
import {
  BarChart3,
  Boxes,
  Banknote,
  CalendarClock,
  CalendarRange,
  BedDouble,
  CalendarDays,
  Package,
  Pill,
  Contact,
  FlaskConical,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  User,
  UsersRound,
  X,
  Navigation,
  Settings,
} from "lucide-react"

import { NavMain } from "./superadmin/nav-main"
import { NavUser } from "./superadmin/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { Logo } from "../logo"

/**
 * One sidebar for the clinic panel.
 *
 * There were four — doctor, nutritionist, admin, superadmin — because the
 * routes were role-shaped, so which sidebar you saw depended on which folder
 * you were standing in. That could never show a page belonging to another
 * role's folder, which is exactly what a clinic-invented role needs.
 *
 * Now the links are the permission registry, in registry order, filtered by
 * what the signed-in account actually holds. A role created this afternoon
 * gets a correct sidebar with no code change. Hiding a link is not an access
 * control: every page behind these checks the same permission server-side.
 */
const NAV_SECTIONS: {
  label: string | null
  items: { title: string; url: string; icon: React.ComponentType; permission: string }[]
}[] = [
  {
    label: null,
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, permission: "clinic.home" },
      { title: "Patients", url: "/patients", icon: User, permission: "clinic.patients" },
      {
        title: "Appointments",
        url: "/appointments",
        icon: CalendarDays,
        permission: "clinic.appointments",
      },
      { title: "Schedule", url: "/schedule", icon: CalendarRange, permission: "clinic.schedule" },
      // Therapy by the hour — booking and the signed sitting log, for the desk.
      { title: "Therapy calendar", url: "/therapy", icon: BedDouble, permission: "clinic.schedule" },
      {
        title: "My Availability",
        url: "/availability",
        icon: CalendarClock,
        permission: "clinic.availability",
      },
      { title: "Billing", url: "/billing", icon: Banknote, permission: "clinic.billing" },
      // The lab's own section (also served on lab.predict.fit).
      { title: "Lab", url: "/lab", icon: FlaskConical, permission: "clinic.lab" },
      { title: "Field visits", url: "/field", icon: Navigation, permission: "clinic.field" },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Settings", url: "/settings", icon: Settings, permission: "clinic.settings" },
      { title: "Reports", url: "/reports", icon: BarChart3, permission: "clinic.reports" },
      { title: "Team", url: "/team", icon: UsersRound, permission: "clinic.team" },
      { title: "Roles", url: "/roles", icon: ShieldCheck, permission: "clinic.roles" },
      {
        title: "Biomarkers",
        url: "/biomarkers",
        icon: FlaskConical,
        permission: "clinic.biomarkers",
      },
      { title: "AI Assistant", url: "/ai", icon: Sparkles, permission: "clinic.ai" },
      {
        title: "Care Plan Library",
        url: "/care-plan-library",
        icon: Pill,
        permission: "clinic.care_plan_library",
      },
      {
        title: "Treatment Plans",
        url: "/treatment-plans",
        icon: Package,
        permission: "clinic.treatment_plans",
      },
      { title: "Medicine Stock", url: "/stock", icon: Boxes, permission: "clinic.stock" },
    ],
  },
]

export function AppSidebar({
  permissions = [],
  brand = null,
  modules = null,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  permissions?: string[]
  /** The clinic signed in to — its logo, or its name where it has none. */
  brand?: { name: string; logoUrl: string | null; logoDarkUrl: string | null } | null
  /**
   * The clinic's switched-on modules; null for every module. Permissions are
   * already filtered by module, but Schedule, Therapy calendar and Lab share
   * or lack a module permission, so their links follow NAV_MODULE as well.
   */
  modules?: ClinicModule[] | null
}) {
  const pathname = usePathname()
  const held = new Set(permissions)
  const moduleOn = (url: string) => !modules || !NAV_MODULE[url] || modules.includes(NAV_MODULE[url]!)
  const { isMobile, setOpenMobile } = useSidebar()

  // On a phone the sidebar is a sheet over the page: once a link has taken
  // you somewhere, it has done its job and should get out of the way.
  React.useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])

  // A section whose items are all filtered out disappears rather than leaving
  // a heading over nothing.
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => held.has(item.permission) && moduleOn(item.url))
      .map((item) => ({
        ...item,
        isActive: pathname === item.url || pathname.startsWith(`${item.url}/`),
      })),
  })).filter((section) => section.items.length > 0)

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="bg-background">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center justify-between">
            <Link href="/" className="flex h-12 items-center px-3">
              {brand?.logoUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={brand.logoUrl} alt={brand.name} className={`h-9 w-auto max-w-[11rem] object-contain ${brand.logoDarkUrl ? "dark:hidden" : ""}`} />
                  {brand.logoDarkUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={brand.logoDarkUrl} alt={brand.name} className="hidden h-9 w-auto max-w-[11rem] object-contain dark:block" />
                  )}
                </>
              ) : brand ? (
                <span className="truncate text-base font-bold tracking-tight">{brand.name}</span>
              ) : (
                <Logo className="h-32 w-auto" />
              )}
            </Link>
            {isMobile && (
              <Button variant="ghost" size="icon-sm" className="mr-1 text-muted-foreground hover:text-foreground"
 type="button"
 onClick={() => setOpenMobile(false)}
 aria-label="Close menu"

 >
                <X className="size-5" />
              </Button>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="bg-background">
        {sections.map((section, i) => (
          <div key={section.label ?? `section-${i}`}>
            {section.label && (
              <p className="px-5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {section.label}
              </p>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <NavMain items={section.items as any} />
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="bg-background">
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}

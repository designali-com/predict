"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, FlaskConical, Send, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { Logo } from "@/src/components/logo"
import { NavMain } from "@/src/components/dashboard/superadmin/nav-main"
import { NavUser } from "@/src/components/dashboard/superadmin/nav-user"
import { useLabHref } from "./lab-base"

/** The lab's menu — the clinic's sidebar, with only the lab in it. */
export function LabSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const href = useLabHref()
  const { isMobile, setOpenMobile } = useSidebar()

  React.useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])

  const orders = href("/")
  const schedule = href("/schedule")
  const referrals = href("/referrals")
  const items = [
    {
      title: "Orders",
      url: orders,
      icon: FlaskConical,
      isActive: pathname === "/lab" || pathname === "/" || pathname.includes("/orders"),
    },
    { title: "Schedule", url: schedule, icon: CalendarDays, isActive: pathname.endsWith("/schedule") },
    { title: "Referrals", url: referrals, icon: Send, isActive: pathname.endsWith("/referrals") },
  ]

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="bg-background">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center justify-between">
            <Link href={orders} className="flex h-12 items-center gap-2 px-3">
              <Logo className="h-32 w-auto" />
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Lab
              </span>
            </Link>
            {isMobile && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="mr-1 text-muted-foreground hover:text-foreground"
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
        <p className="px-5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Lab</p>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <NavMain items={items as any} />
      </SidebarContent>

      <SidebarFooter className="bg-background">
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}

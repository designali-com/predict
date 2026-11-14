"use client"

import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { NavHeader } from "@/src/components/layout/navbar"

/** The clinic's header bar, without the clinic switcher — the lab works for every clinic. */
export function LabSiteHeader({ userName }: { userName: string }) {
  const hour = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }))
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b">
      <div className="flex h-6 w-full min-w-0 items-center gap-1 px-2 lg:gap-2">
        <SidebarTrigger />
        <Separator orientation="vertical" />
        <span className="ml-1 text-sm font-semibold">Predict Lab</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm font-medium md:inline">
            {greeting}, {userName.split(" ")[0]}.
          </span>
          <NavHeader />
        </div>
      </div>
    </header>
  )
}

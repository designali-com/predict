"use client"

import {
  ActivityIcon,
  CalendarCheckIcon,
  FileTextIcon,
  HomeIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"
import { Logo } from "@workspace/ui/predict/logo"

const health = [
  { title: "Overview", icon: HomeIcon, isActive: true },
  { title: "Biomarkers", icon: ActivityIcon, badge: "9" },
  { title: "Reports", icon: FileTextIcon },
  { title: "Appointments", icon: CalendarCheckIcon },
]

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center px-4 group-data-[collapsible=icon]:px-2">
        <Logo
          role="img"
          aria-label="PREDICT"
          className="h-4 w-auto group-data-[collapsible=icon]:hidden"
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Health</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {health.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton isActive={item.isActive} tooltip={item.title}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings">
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Priya Sharma">
              <UserIcon />
              <span>Priya Sharma</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

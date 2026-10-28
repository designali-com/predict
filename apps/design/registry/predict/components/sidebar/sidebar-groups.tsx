"use client"

import {
  ActivityIcon,
  BellIcon,
  HeartPulseIcon,
  HomeIcon,
  UserIcon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@workspace/ui/components/sidebar"

const groups = [
  {
    label: "Health",
    items: [
      { title: "Home", icon: HomeIcon },
      { title: "Biomarkers", icon: ActivityIcon },
      { title: "Heart", icon: HeartPulseIcon },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Profile", icon: UserIcon },
      { title: "Notifications", icon: BellIcon },
    ],
  },
]

export function SidebarGroups() {
  return (
    <SidebarProvider className="min-h-0 w-auto">
      <Sidebar collapsible="none" className="h-96 rounded-lg border">
        <SidebarContent>
          {groups.map((group, index) => (
            <div key={group.label}>
              {index > 0 ? <SidebarSeparator /> : null}
              <SidebarGroup>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton>
                          <item.icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </div>
          ))}
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  )
}

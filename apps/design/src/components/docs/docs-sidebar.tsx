"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import type { source } from "@/src/lib/source"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

const TOP_LEVEL_SECTIONS = [
  { name: "Introduction", href: "/docs" },
]

const EXCLUDED_SECTIONS = [""]
const EXCLUDED_PAGES: string[] = [

]

const NEW_COMPONENTS = [
  ""
]

export function DocsSidebar({
  tree,
  sections = TOP_LEVEL_SECTIONS,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  tree: typeof source.pageTree
  /** Links under "Getting Started". */
  sections?: { name: string; href: string }[]
}) {
  const pathname = usePathname()

  return (
    <Sidebar
      className="sticky bg-transparent overflow-y-auto top-16 hidden h-[calc(100vh-5rem)] w-52 shrink-0 xl:block"
      collapsible="none"
      {...props}
    >
      <SidebarContent className="no-scrollbar overflow-x-hidden px-2 pb-12">
        <div className="h-(--top-spacing) shrink-0" />
        <SidebarGroup>
          <SidebarGroupLabel>
            Getting Started
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map(({ name, href }) => {
                return (
                  <SidebarMenuItem key={name}>
                    <SidebarMenuButton
                      render={<Link href={href}>
                        <span className="absolute inset-0 flex w-(--sidebar-width) bg-transparent" />
                        {name}
                      </Link>} 
                      isActive={
                        href === "/docs" || href === "/docs/components" || href === "/biomarkers"
                          ? pathname === href
                          : pathname.startsWith(href)
                      }
                      className="data-[active=true]:bg-border data-[active=true]:border-border 3xl:fixed:w-full 3xl:fixed:max-w-48 relative w-full overflow-visible border border-transparent text-[0.8rem] font-medium after:absolute after:inset-x-0 after:-inset-y-1 after:z-0 after:rounded-full"
                    />
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {tree.children.map((item) => {
          if (EXCLUDED_SECTIONS.includes(item.$id ?? "")) {
            return null
          } 
          return (
            <SidebarGroup key={item.$id}>
              <SidebarGroupLabel>
                {item.name}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                {item.type === "folder" && (
                  <SidebarMenu className="gap-0.5">
                    {item.children.map((item) => {
                      const isNew = NEW_COMPONENTS.includes(item.$id ?? "")
                      return (
                        item.type === "page" &&
                        !EXCLUDED_PAGES.includes(item.url) && (
                          <SidebarMenuItem key={item.url}>
                            <SidebarMenuButton
                              render={<Link href={item.url}>
                                <span className="absolute inset-0 flex w-(--sidebar-width) bg-transparent" />
                                <span className="flex items-center gap-2">
                                  {item.name}
                                  {isNew && (
                                    <span
                                      className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full"
                                      aria-label="New component"
                                    />
                                  )}
                                </span>
                              </Link>}
                              isActive={item.url === pathname}
                              className="data-[active=true]:bg-border data-[active=true]:border-border 3xl:fixed:w-full 3xl:fixed:max-w-48 relative w-full overflow-visible border border-transparent text-[0.8rem] font-medium after:absolute after:inset-x-0 after:-inset-y-1 after:z-0 after:rounded-full"
                            />


                          </SidebarMenuItem>
                        )
                      )
                    })}
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>
    </Sidebar>
  )
}
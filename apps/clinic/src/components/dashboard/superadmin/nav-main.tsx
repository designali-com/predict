"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LucideIcon } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar";

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon: LucideIcon;
    /** Present on every real entry; the sidebar filters on it before this. */
    permission?: string;
  }[];
}) {
  const pathname = usePathname();
  // Closes the phone sheet even when the tapped link is the page already open
  // (the sidebar also closes on every route change).
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            // "/dashboard" is a prefix of nothing else, but a top-level entry
            // still must not light up for a deeper page that merely starts the
            // same way.
            const isActive =
              pathname === item.url || pathname.startsWith(`${item.url}/`);

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  className="max-md:h-11 max-md:text-[15px]"
                  render={
                    <Link
                      href={item.url}
                      onClick={() => setOpenMobile(false)}
                      className={cn(
                        "flex items-center gap-2 transition-opacity duration-200",
                        isActive ? "font-medium" : "text-muted-foreground hover:opacity-100 "
                      )}
                    >
                      <item.icon
                        className={cn(
                          "size-4 shrink-0 transition-all duration-200",
                          isActive
                            ? "opacity-100"
                            : "opacity-50"
                        )}
                      />

                      <span>{item.title}</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
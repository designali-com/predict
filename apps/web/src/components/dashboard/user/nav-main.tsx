"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
    icon: ComponentType<{ className?: string }>;
  }[];
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            const isActive =
              item.url === "/dashboard"
                ? pathname === item.url
                : pathname === item.url ||
                  pathname.startsWith(`${item.url}/`);

            return (
              <SidebarMenuItem key={item.title}>
                {/* Finger-sized on a phone — 48px rows, 16px text, 20px
                    icons — and back to the desktop sizes from md up. */}
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  className="h-12 gap-3 text-base [&_svg]:size-5 md:h-9 md:gap-2 md:text-sm md:[&_svg]:size-4"
                  render={
                    <Link
                      href={item.url}
                      // On a phone the sidebar is a panel over the page; going
                      // somewhere should put it away, not leave it covering
                      // the page just opened.
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                      className={cn(
                        "flex items-center gap-2 transition-opacity duration-200",
                        isActive ? "font-medium" : "text-muted-foreground hover:opacity-100 "
                      )}
                    >
                      <item.icon
                        className={cn(
                          "shrink-0 transition-all duration-200",
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
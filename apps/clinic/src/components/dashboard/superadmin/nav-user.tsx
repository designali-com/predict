"use client";

import { authClient } from "@/src/lib/auth/auth-client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar";

import { Building2, Check, LogOut } from "lucide-react";
import { useClinics } from "@/src/components/dashboard/clinic-switcher";

export function NavUser() {
  const { isMobile } = useSidebar();

  const { data: session, isPending } = authClient.useSession();
  const { clinics, activeId, switching, switchTo } = useClinics();

  if (isPending || !session) return null;

  const { signOut } = authClient;

  const user = session.user;

  const initials =
    user.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    user.email.charAt(0).toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar bg-muted w-full data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.image ?? ""} alt={user.name ?? ""} />
                  <AvatarFallback className="rounded-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {user.name || "User"}
                  </span>

                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </SidebarMenuButton>
            }
          />

          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) rounded-lg"
            side={isMobile ? "top" : "top"}
            align="center"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-3 px-3 py-3">
                  <Avatar className="h-10 w-10 rounded-lg">
                    <AvatarImage src={user.image ?? ""} alt={user.name ?? ""} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>

                  <div className="grid flex-1">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>

            {/* Which clinic this is — and, for somebody in more than one, the switch. */}
            {clinics.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Clinic
                  </DropdownMenuLabel>
                  {clinics.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      className="cursor-pointer"
                      disabled={switching || clinics.length === 1}
                      onClick={() => void switchTo(c.id)}
                    >
                      <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{c.name}</span>
                      {c.id === activeId && <Check className="ml-2 h-4 w-4" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="text-destructive cursor-pointer"
              onClick={() =>
                signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      window.location.href = "/";
                    },
                  },
                })
              }
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
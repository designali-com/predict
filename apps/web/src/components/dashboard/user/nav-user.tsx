"use client"

import { visibleEmail } from "@workspace/db/placeholder-email"
import { LogOut } from "lucide-react"

import type { auth } from "@/src/lib/auth/auth"
import { authClient } from "@/src/lib/auth/auth-client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"

type SessionData = Awaited<ReturnType<typeof auth.api.getSession>>

interface NavUserProps {
  // Passed down from the server-rendered dashboard layout to avoid a
  // redundant client-side session fetch. Falls back to fetching
  // client-side when omitted (other role dashboards still do this).
  // The layout already redirects unauthenticated visitors away, so a
  // passed-in session is always valid — never explicitly null.
  session?: NonNullable<SessionData>
}

export function NavUser({ session }: NavUserProps = {}) {
  if (session !== undefined) {
    return <NavUserContent session={session} />
  }
  return <NavUserWithClientSession />
}

function NavUserWithClientSession() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending || !session) {
    return null
  }

  return <NavUserContent session={session} />
}

function NavUserContent({ session }: { session: NonNullable<SessionData> }) {
  const { isMobile } = useSidebar()
  const user = session.user

  // Normalize role
  const userRole = user.role?.trim().toLowerCase() ?? "user"

  // User initials
  const initials =
    user.name
      ?.split(" ")
      .map((name) => name[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U"

  // Format role name
  const formatRoleName = (role: string) => {
    return role
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }

  // Sign out
  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/"
        },
      },
    })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          {/* ============================================================
              USER TRIGGER
          ============================================================ */}

          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="w-full data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    src={user.image ?? ""}
                    alt={user.name ?? ""}
                  />

                  <AvatarFallback className="rounded-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {user.name || "User"}
                  </span>

                  <span className="truncate text-xs text-muted-foreground">
                    {visibleEmail(user.email)}
                  </span>
                </div>
              </SidebarMenuButton>
            }
          />

          {/* ============================================================
              DROPDOWN
          ============================================================ */}

          <DropdownMenuContent
            className="w-55 max-w-55 rounded-lg shadow-sm"
            side={isMobile ? "top" : "top"}
            align="center"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              {/* ========================================================
                  USER INFORMATION
              ======================================================== */}

              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-3 px-3 py-3">
                  <Avatar className="h-10 w-10 rounded-lg">
                    <AvatarImage
                      src={user.image ?? ""}
                      alt={user.name ?? ""}
                    />

                    <AvatarFallback className="rounded-lg">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">
                      {user.name || "User"}
                    </span>

                    <span className="truncate text-xs text-muted-foreground">
                      {visibleEmail(user.email)}
                    </span>

                    {/* Never tell somebody they are "Patient" — it is how the
                        clinic files them, not how they think of themselves.
                        Staff roles still show. */}
                    {userRole !== "patient" && userRole !== "user" && (
                      <span className="pt-1 text-xs font-medium text-primary">
                        {formatRoleName(userRole)}
                      </span>
                    )}
                  </div>
                </div>
              </DropdownMenuLabel>

            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            {/* ==========================================================
                SIGN OUT
            ========================================================== */}

            <DropdownMenuItem
              className="cursor-pointer text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

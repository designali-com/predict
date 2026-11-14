"use client";

import { visibleEmail } from "@workspace/db/placeholder-email";
import React from "react";

import { authClient } from "@/src/lib/auth/auth-client";

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
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar";
import { ModeToggle } from "../common/toggle-mode";

export function NavHeader() {
  const { signOut, useSession } = authClient;
  const { data: session, isPending } = useSession();

  if (isPending || !session) {
    return null;
  }

  const userRole = session.user.role?.trim().toLowerCase() ?? "user";

  const initials =
    session.user.name
      ?.split(" ")
      .map((name) => name[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    "U";

  const formatRoleName = (role: string) => {
    return role
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  return (
    <header className="flex items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Avatar className="cursor-pointer">
            <AvatarImage
              src={session.user.image ?? ""}
              alt={session.user.name ?? ""}
            />

            <AvatarFallback>
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-64"
        >
          <DropdownMenuGroup>
            {/* User Information */}
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {session.user.name || "User"}
                </p>

                <p className="text-xs leading-none text-muted-foreground">
                  {visibleEmail(session.user.email)}
                </p>

                {/* Never "Patient" — see nav-user.tsx. Staff roles still show. */}
                {userRole !== "patient" && userRole !== "user" && (
                  <p className="pt-1 text-xs font-medium text-primary">
                    {formatRoleName(userRole)}
                  </p>
                )}
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <ModeToggle/>
           
          <DropdownMenuItem
            className="cursor-pointer"
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
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
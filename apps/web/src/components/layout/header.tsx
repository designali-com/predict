"use client"

import { visibleEmail } from "@workspace/db/placeholder-email";
import React from "react"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Logo } from "@/src/components/logo"
import { cn } from "@workspace/ui/lib/utils"
import { authClient } from "@/src/lib/auth/auth-client"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar"
import { ThemeSwitcher } from "../common/toggle-mode"

const navLinks = [
    { name: "Why Us", href: "#the-optm-method" },
    { name: "The Science", href: "#the-science" },
]

export function Header() {
    const { signOut, useSession } = authClient
    const { data: session, isPending } = useSession()

    const [isScrolled, setIsScrolled] = React.useState(false)

    React.useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 4)
        }
        window.addEventListener("scroll", handleScroll)
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    return (
        <header
            className={cn(
                "fixed top-0 left-0 right-0 z-50 mx-auto w-full px-2 pt-2 pb-2 transition-all duration-300",
                isScrolled && "border-b-0"
            )}
        >
            <nav
                className={cn(
                    "w-full px-3 duration-300 md:px-4",
                    isScrolled ? "border-transparent" : ""
                )}
            >
                <div
                    className={cn(
                        "mx-auto transition-all duration-300 flex h-12 container items-center justify-between px-2 rounded-full",
                        isScrolled && "max-w-3xl bg-foreground/10 backdrop-blur-md shadow-sm"
                    )}
                >
                    <div className="mx-auto flex w-full items-center justify-between">
                        <Link href="/" className="text-xl w-52 pl-3">
                            <Logo className="size-30 pb-0.5" />
                        </Link>

                        {/* Navigation */}
                        <nav className="hidden items-center gap-8">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    className="text-xs text-muted-foreground transition hover:text-foreground"
                                >
                                    {link.name}
                                </Link>
                            ))}
                        </nav>

                        {isPending ? (
                            <div className="h-9 w-24" />
                        ) : session ? (
                            <div className="items-center flex gap-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger render={
                                        <Button variant="ghost" size="icon" className="rounded-full">
                                            <Avatar className="h-9 w-9">
                                                <AvatarImage
                                                    src={session.user.image || ""}
                                                    alt={session.user.name || ""}
                                                />
                                                <AvatarFallback className="text-xs">
                                                    {session.user.name?.charAt(0)?.toUpperCase() ||
                                                        visibleEmail(session.user.email)?.charAt(0)?.toUpperCase() ||
                                                        "U"}
                                                </AvatarFallback>
                                            </Avatar>
                                        </Button>
                                    } />
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuGroup>
                                            <DropdownMenuLabel>
                                                <div className="flex flex-col space-y-1">
                                                    <p className="text-sm font-medium leading-none">
                                                        {session.user.name || "User"}
                                                    </p>
                                                    <p className="text-xs leading-none text-muted-foreground">
                                                        {visibleEmail(session.user.email) ?? ""}
                                                    </p>
                                                </div>
                                            </DropdownMenuLabel>
                                            <DropdownMenuItem className="cursor-pointer" render={<Link href="/dashboard">Dashboard</Link>} />
                                            <div className="p-2">
                                            <ThemeSwitcher/>
                                            </div>
                                        </DropdownMenuGroup>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="cursor-pointer"
                                            onClick={() =>
                                                signOut({
                                                    fetchOptions: {
                                                        onSuccess: () => {
                                                            window.location.href = "/"
                                                        },
                                                    },
                                                })
                                            }
                                        >
                                            Sign Out
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ) : (
                            <div className="flex gap-2 items-center">
                                <Button render={<Link href="/auth/login">Start Free</Link>} />
                            </div>
                        )}
                    </div>
                </div>
            </nav>
        </header>
    )
}
"use client"

import React from "react"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Logo } from "@workspace/ui/predict/logo"
import { cn } from "@workspace/ui/lib/utils"

const navLinks = [
    { name: "Docs", href: "/docs" },
    { name: "Components", href: "/docs/components/accordion" }, 
    { name: "Blocks", href: "/blocks" },
    { name: "Brand", href: "/docs/design/logos" },  
    { name: "Biomarkers", href: "/biomarkers" }, 
]

export function Header() {
   
    return (
        <header
            className={cn(
                "sticky bg-background/60 backdrop-blur-md border-b top-0 left-1/2 z-50 mx-auto w-full transition-all duration-300",
            )}
        >
            <nav
                className={cn(
                    "w-full", 
                )}
            >
                <div
                    className={cn(
                        "mx-auto transition-all duration-300 flex h-fit max-w-7xl border-x items-center justify-between p-2",
                         
                    )}
                >
                    <div className="mx-auto flex w-full items-center justify-between">
                        <Link href="/" className="text-xl w-48 pl-2">
                            <Logo className="size-30 h-6 pb-0.5" />
                        </Link>

                        {/* Navigation */}
                        <nav className="items-center hidden md:flex pl-4 w-full gap-8">
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

                        <Button nativeButton={false} render={<Link target="_blank" href="https://predict.fit">Join Now</Link>} />
                    </div>
                </div>
            </nav>
        </header>
    )
}
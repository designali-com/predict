"use client"

import React from "react"
import Link from "next/link"
import { Logo } from "@/src/components/logo"

export function AuthHeader() {


    return (
        <header className="z-50 fixed border-b border-dashed w-full py-2">
            <nav className="mx-auto relative transition-all duration-300 flex h-12 container items-center justify-center px-2 rounded-full">
                <Link href="/" className="flex items-center">
                    <Logo className="size-30 pb-0.5" />
                </Link>
            </nav>
        </header>
    )
}
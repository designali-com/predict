"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRightIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { LiquidMetal } from '@paper-design/shaders-react';

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { Logo, PredictLogo } from "@workspace/ui/predict/logo"

const columns = [
  {
    title: "Foundations",
    links: [
      { name: "Introduction", href: "/docs" },
      { name: "Brand guidelines", href: "/docs/design/logos" },
      { name: "Colors", href: "/docs/design/colors" },
      { name: "Typography", href: "/docs/design/typography" },
    ],
  },
  {
    title: "Build",
    links: [
      { name: "Components", href: "/docs/components/accordion" },
      { name: "Blocks", href: "/blocks" },
      { name: "PREDICT UI", href: "/docs/ui/bio-clock" },
      { name: "Tools", href: "/docs/tools/age-calculator" },
    ],
  },
  {
    title: "Health",
    links: [
      { name: "Biomarkers", href: "/biomarkers" },
      { name: "Indices", href: "/biomarkers/indices" },
      { name: "Reference ranges", href: "/docs/tools/reference-range" },
    ],
  },
  {
    title: "PREDICT",
    links: [{ name: "predict.fit", href: "https://predict.fit", external: true }],
  },
]

const themes = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // The theme is only known on the client, so wait before showing the active one.
  React.useEffect(() => setMounted(true), [])

  return (
    <div role="radiogroup" aria-label="Theme" className="flex items-center gap-0.5 rounded-full border p-0.5">
      {themes.map(({ value, label, icon: Icon }) => {
        const active = mounted && theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground",
              active && "bg-muted text-foreground"
            )}
          >
            <Icon className="size-3.5" />
          </button>
        )
      })}
    </div>
  )
}

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto w-full max-w-7xl border-x">
        <div className="grid gap-10 px-6 py-12 md:px-10 lg:grid-cols-[1.2fr_2fr]">
          <div className="flex flex-col items-start gap-4">
            <Link href="/" aria-label="PREDICT home">
              <Logo className="h-5 size-30" />
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">
              The design system behind PREDICT: components, blocks, and
              guidelines for clear health interfaces.
            </p>
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="https://predict.fit" target="_blank" rel="noreferrer" />}
            >
              Join Now
            </Button>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((column) => (
              <div key={column.title} className="flex flex-col gap-3">
                <p className="text-xs font-medium text-foreground">{column.title}</p>
                <ul className="flex flex-col gap-2">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      {"external" in link ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
                        >
                          {link.name}
                          <ArrowUpRightIcon className="size-3" />
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-xs text-muted-foreground transition hover:text-foreground"
                        >
                          {link.name}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="overflow-hidden border-t px-6" aria-hidden>
            <div className="mx-auto flex h-full w-full max-w-100 md:max-w-200 xl:max-w-full">
            <LiquidMetal
              className="h-80 size-400 "
               
              image="/logo.svg"
              colorBack="#aaaaac00"
              colorTint="#ffffff"
              shape="diamond"
              repetition={2}
              softness={0.1}
              shiftRed={0.3}
              shiftBlue={0.3}
              distortion={0.07}
              contour={0.4}
              angle={70}
              speed={1}
              scale={0.6}
            /> 
            </div>
        </div>
        <div className="flex flex-col gap-4 border-t px-6 py-5 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-10">
          <div className="flex flex-col gap-1">
            <p className="text-xs">© {new Date().getFullYear()} PREDICT. All rights reserved.</p>
            <p className="text-xs">Biomarker content is general information, not medical advice.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline">
              Press <kbd className="rounded border px-1 font-mono text-[10px]">D</kbd> to switch
            </span>
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </footer>
  )
}

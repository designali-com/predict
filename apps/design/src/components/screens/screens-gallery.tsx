"use client"

import * as React from "react"
import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"

import { PhoneFrame, type ScreenTheme } from "./phone-frame"
import { screenGroups } from "./registry"

const scales = [
  { value: "0.4", label: "40%" },
  { value: "0.6", label: "60%" },
  { value: "1", label: "100%" },
]

type ThemeMode = ScreenTheme | "both"

const themes: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "both", label: "Side by side" },
]

export function ScreensGallery() {
  const [scale, setScale] = React.useState("0.6")
  const [theme, setTheme] = React.useState<ThemeMode>("system")
  const groups = screenGroups.filter((group) => group.screens.length > 0)
  const total = groups.reduce((sum, group) => sum + group.screens.length, 0)

  return (
    <div className="mx-auto max-w-7xl border-x">
      <section className="flex flex-col gap-6 border-b px-4 py-12 md:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-heading-40 md:text-heading-48">App Screens</h1>
          <p className="max-w-xl text-sm">
            Every phone screen from the PREDICT app design ({total} screens), built with
            the components in <code>@workspace/ui</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <nav className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <Link key={group.slug} href={`#${group.slug}`}>
                <Badge variant="outline" className="gap-1.5">
                  {group.title}
                  <span className="text-muted-foreground">{group.screens.length}</span>
                </Badge>
              </Link>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={theme} onValueChange={(value) => setTheme(value as ThemeMode)}>
              <TabsList aria-label="Screen theme">
                {themes.map((item) => (
                  <TabsTrigger key={item.value} value={item.value} className="px-4 py-2 text-xs">
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Tabs value={scale} onValueChange={(value) => setScale(String(value))}>
              <TabsList aria-label="Screen scale">
                {scales.map((item) => (
                  <TabsTrigger key={item.value} value={item.value} className="px-4 py-2 text-xs">
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>
      </section>

      {groups.map((group) => (
        <section key={group.slug} id={group.slug} className="scroll-mt-20 border-b">
          <header className="flex items-center gap-3 px-4 pt-10 md:px-8">
            <span className="h-6 w-1 rounded-full bg-app-accent" />
            <h2 className="text-heading-20 font-medium">{group.title}</h2>
            <span className="text-xs text-muted-foreground">
              {group.screens.length} {group.screens.length === 1 ? "screen" : "screens"}
            </span>
          </header>
          <div className="flex gap-6 overflow-x-auto px-4 pt-6 pb-10 md:px-8">
            {group.screens.map((screen) =>
              theme === "both" ? (
                <div key={screen.slug} id={screen.slug} className="flex shrink-0 scroll-mt-32 gap-3">
                  <PhoneFrame screen={screen} scale={Number(scale)} theme="light" label="Light" />
                  <PhoneFrame screen={screen} scale={Number(scale)} theme="dark" label="Dark" />
                </div>
              ) : (
                <PhoneFrame
                  key={screen.slug}
                  id={screen.slug}
                  className="scroll-mt-32"
                  screen={screen}
                  scale={Number(scale)}
                  theme={theme}
                />
              )
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

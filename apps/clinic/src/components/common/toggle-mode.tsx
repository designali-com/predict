"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react" 

import type { JSX } from "react"
import { useSyncExternalStore } from "react"
import { motion } from "motion/react"
import { useTheme, type Theme } from "@workspace/ui/components/theme"
import { MonitorIcon, SunIcon, MoonIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

export function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <Button variant="ghost" size="icon">
        <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        <span className="sr-only">Toggle theme</span>
      </Button>
      }>
        
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}


function ThemeOption({
  icon,
  value,
  isActive,
  onClick,
}: {
  icon: JSX.Element
  // The three the provider knows about, not any string: a typo used to be a
  // silent no-op that left the toggle looking active for a theme nothing set.
  value: Theme
  isActive?: boolean
  onClick: (value: Theme) => void
}) {
  return (
    <Button variant="ghost" size="icon-sm"
      data-active={isActive}
      className="relative rounded-full text-muted-foreground transition-[color] hover:text-foreground data-[active=true]:text-foreground [&_svg]:size-4"
      role="radio"
      aria-checked={isActive}
      aria-label={`Switch to ${value} theme`}
      onClick={() => onClick(value)}
    >
      {icon}
 
      {isActive && (
        <motion.span
          layoutId="theme-option"
          transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
          className="absolute inset-0 rounded-full border"
        />
      )}
    </Button>
  )
}
 
const THEME_OPTIONS: { value: Theme; icon: JSX.Element; label?: string }[] = [
  {
    icon: (
      <MonitorIcon
      />
    ),
    value: "system",
  },
  {
    icon: (
      <SunIcon
      />
    ),
    value: "light",
  },
  {
    icon: (
      <MoonIcon
      />
    ),
    value: "dark",
  },
]
 
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
 
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
 
  if (!isMounted) {
    return <div className="flex h-8 w-24" />
  }
 
  return (
    <motion.div
      key={String(isMounted)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="inline-flex items-center overflow-clip rounded-full bg-background inset-ring-1 inset-ring-border"
      role="radiogroup"
    >
      {THEME_OPTIONS.map((option) => (
        <ThemeOption
          key={option.value}
          icon={option.icon}
          value={option.value}
          isActive={theme === option.value}
          onClick={setTheme}
        />
      ))}
    </motion.div>
  )
} 
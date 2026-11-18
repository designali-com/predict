"use client"

import * as React from "react"
import { ThemeProvider as BaseThemeProvider, useTheme } from "@workspace/ui/components/theme"

/**
 * The app's theme, plus the "d" hotkey.
 *
 * Was next-themes, which renders its no-flash script from inside a client
 * component — something React 19 will not execute, and warns about on every
 * page. The script now lives in the server-rendered <head> (see THEME_SCRIPT
 * in @workspace/ui/components/theme), which is where React asks for it.
 */
function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <BaseThemeProvider defaultTheme="dark">
      <ThemeHotkey />
      {children}
    </BaseThemeProvider>
  )
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key?.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider }

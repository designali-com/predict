"use client"

import * as React from "react"

/**
 * The theme, without next-themes.
 *
 * next-themes renders its no-flash script from inside its provider, which is a
 * client component. React 19 refuses to run a <script> rendered on the client
 * and warns about it on every page — and there is no version that does not:
 * 0.4.6 does it, and so does 1.0.0-beta.0.
 *
 * The script has to exist. Without it the page paints in the default theme and
 * then swaps, which is the flash everybody notices. React's own answer is to
 * hoist it into the server-rendered document, so that is what THEME_SCRIPT
 * below is for: it goes in <head> in a server layout, and this provider only
 * reads and writes state afterwards.
 */

export type Theme = "light" | "dark" | "system"
export type Resolved = "light" | "dark"

export const THEME_STORAGE_KEY = "predict-theme"

/**
 * What a first visit opens in: dark, whatever the device prefers. A choice
 * made with the toggle is stored and wins from then on.
 */
export const DEFAULT_THEME: Theme = "dark"

interface ThemeState {
  /** What was chosen — may be "system". */
  theme: Theme
  /** What that actually means right now. Never "system". */
  resolvedTheme: Resolved
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeState | null>(null)

/**
 * The inline script, as a string, for a server-rendered <head>.
 *
 * Runs before first paint: reads the stored choice, falls back to
 * DEFAULT_THEME (dark), and puts the class on <html> so the very first frame is already
 * the right colour. It also sets color-scheme, which is what makes native
 * controls — selects, date pickers, scrollbars — dark instead of white.
 *
 * Written defensively because it runs before anything else: a private window
 * can make localStorage throw outright, and a theme script that throws takes
 * the whole page's first paint with it.
 */
export const THEME_SCRIPT = `(function(){try{
var k=${JSON.stringify(THEME_STORAGE_KEY)};
var s=localStorage.getItem(k)||${JSON.stringify(DEFAULT_THEME)};
var d=s==="dark"||(s==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
var e=document.documentElement;
e.classList.toggle("dark",d);
e.style.colorScheme=d?"dark":"light";
}catch(_){var e=document.documentElement;e.classList.toggle("dark",${JSON.stringify(DEFAULT_THEME === "dark")});}})()`

function systemTheme(): Resolved {
  if (typeof window === "undefined") return "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function readStored(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function apply(resolved: Resolved, animate: boolean) {
  const el = document.documentElement

  // Without this every colour on the page transitions at once when the theme
  // changes, which reads as the screen melting rather than switching.
  let undo: (() => void) | null = null
  if (!animate) {
    const style = document.createElement("style")
    style.appendChild(
      document.createTextNode("*,*::before,*::after{transition:none!important}"),
    )
    document.head.appendChild(style)
    undo = () => {
      // Read something back first, so the browser has actually applied the
      // rule before it is taken away again.
      window.getComputedStyle(document.body).opacity
      document.head.removeChild(style)
    }
  }

  el.classList.toggle("dark", resolved === "dark")
  el.style.colorScheme = resolved
  undo?.()
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
}: {
  children: React.ReactNode
  defaultTheme?: Theme
}) {
  // Starts at the default and is corrected on mount. The script above has
  // already painted the right colours; this is only React catching up with
  // what the document already says, so there is nothing to see.
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)
  const [resolved, setResolved] = React.useState<Resolved>("dark")

  React.useEffect(() => {
    const stored = readStored()
    setThemeState(stored)
    setResolved(stored === "system" ? systemTheme() : stored)
  }, [])

  // Following the system means following it as it changes, not only at load.
  React.useEffect(() => {
    if (theme !== "system") return
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const next = query.matches ? "dark" : "light"
      setResolved(next)
      apply(next, false)
    }
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [theme])

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Blocked storage means the choice does not survive a reload. The page
      // still changes, which is the part the person just asked for.
    }
    const applied = next === "system" ? systemTheme() : next
    setResolved(applied)
    apply(applied, false)
  }, [])

  const value = React.useMemo(
    () => ({ theme, resolvedTheme: resolved, setTheme }),
    [theme, resolved, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * Same shape as next-themes' hook, so the toggles and the toast styling that
 * were written against it did not have to change.
 */
export function useTheme(): ThemeState {
  return (
    React.useContext(ThemeContext) ?? {
      theme: DEFAULT_THEME,
      resolvedTheme: "dark",
      setTheme: () => {},
    }
  )
}

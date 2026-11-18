import * as React from "react"
import { ArrowUpRightIcon } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

import { figmaNodeUrl, type ScreenEntry } from "./types"

/** `system` follows the site theme; `light` / `dark` force the app theme. */
export type ScreenTheme = "system" | "light" | "dark"

export function appThemeClass(theme: ScreenTheme | undefined) {
  if (theme === "light") return "app-light"
  if (theme === "dark") return "app-dark"
  return undefined
}

interface PhoneFrameProps extends React.ComponentProps<"figure"> {
  screen: ScreenEntry
  /** Visual scale of the 402 × 874 device. */
  scale?: number
  theme?: ScreenTheme
  /** Shown after the title, e.g. "Dark" in the side-by-side view. */
  label?: string
}

/** A device-shaped frame that renders one screen at a given scale. */
export function PhoneFrame({
  screen,
  scale = 0.6,
  theme = "system",
  label,
  className,
  ...props
}: PhoneFrameProps) {
  const Component = screen.component
  const viewHref = `/view/screens/${screen.slug}${theme === "system" ? "" : `?theme=${theme}`}`

  return (
    <figure className={cn("flex shrink-0 flex-col gap-3", className)} {...props}>
      <div
        className={cn(
          "overflow-hidden rounded-[34px] bg-app-background shadow-xl ring-1 ring-foreground/10",
          appThemeClass(theme)
        )}
        style={{ width: 402 * scale, height: 874 * scale }}
      >
        <div style={{ zoom: scale }}>
          <Component />
        </div>
      </div>
      <figcaption className="flex items-center justify-between gap-2 px-2 text-xs">
        <a href={viewHref} target="_blank" className="truncate text-foreground hover:underline">
          {screen.title}
          {label ? <span className="text-muted-foreground"> · {label}</span> : null}
        </a>
        <a
          href={figmaNodeUrl(screen.nodeId)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground hover:text-foreground"
        >
          Figma
          <ArrowUpRightIcon className="size-3" />
        </a>
      </figcaption>
    </figure>
  )
}

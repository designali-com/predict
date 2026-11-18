import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Root of every app screen: a 402 × 874 canvas (iPhone 18 Pro frame size in
 * Figma) painted with the --app-* theme, so it renders in light or dark mode.
 * Children lay out inside it; decorative layers can be absolute.
 */
export function Screen({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-screen"
      className={cn(
        "relative flex h-[874px] w-[402px] flex-col overflow-hidden bg-app-background font-sans text-app-foreground",
        className
      )}
      {...props}
    />
  )
}

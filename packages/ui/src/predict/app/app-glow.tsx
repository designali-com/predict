import * as React from "react"
import { cn } from "cn"

interface AppGlowProps extends React.ComponentProps<"div"> {
  /**
   * `blob` — the large blurred violet orb behind the auth screens.
   * `fade` — the 100px violet fade behind the bottom navigation.
   */
  variant?: "blob" | "fade"
}

/** Decorative violet glow anchored to the bottom of a mobile screen. */
function AppGlow({ variant = "blob", className, ...props }: AppGlowProps) {
  return (
    <div
      aria-hidden
      data-slot="app-glow"
      className={cn(
        "pointer-events-none absolute",
        variant === "blob" &&
          "-bottom-[438px] -left-[95px] size-[593px] rounded-full bg-app-glow blur-[100px]",
        variant === "fade" &&
          "inset-x-0 bottom-0 h-[100px] bg-gradient-to-t from-app-glow to-app-glow/0 blur-[0.5px]",
        className
      )}
      {...props}
    />
  )
}

export { AppGlow }

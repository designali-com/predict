import * as React from "react"
import { cn } from "cn"

/**
 * Frosted lavender card used throughout the PREDICT mobile app
 * ("Container (Card | PREDICT)" in Figma).
 */
function AppCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-card"
      className={cn(
        "relative flex w-full flex-col gap-6 overflow-hidden rounded-[40px] bg-app-pill/20 backdrop-blur-md p-[30px] text-app-foreground shadow-(--app-card-shadow)",
        className
      )}
      {...props}
    />
  )
}

function AppCardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-card-header"
      className={cn("flex items-start justify-between gap-3", className)}
      {...props}
    />
  )
}

function AppCardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="app-card-title"
      className={cn(
        "font-display text-[21px] leading-6 font-normal text-app-foreground",
        className
      )}
      {...props}
    />
  )
}

function AppCardDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="app-card-description"
      className={cn("mt-3 max-w-60 text-[10px] leading-[14px] text-app-foreground", className)}
      {...props}
    />
  )
}

export { AppCard, AppCardHeader, AppCardTitle, AppCardDescription }

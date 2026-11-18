"use client"

import * as React from "react"
import { CircleDashedIcon, ClockIcon, GripIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@workspace/ui/components/button"
import { PredictMark } from "@workspace/ui/predict/logo"

type AppTab = "today" | "explore"

interface AppBottomNavProps extends React.ComponentProps<"nav"> {
  active?: AppTab
  onTabChange?: (tab: AppTab) => void
}

const circle =
  "flex size-[60px] shrink-0 items-center justify-center rounded-full bg-app-field text-app-foreground"

/**
 * Floating bottom navigation of the PREDICT mobile app:
 * menu · [Today | explore] · PREDICT assistant.
 */
function AppBottomNav({
  active: activeProp,
  onTabChange,
  className,
  ...props
}: AppBottomNavProps) {
  const [internal, setInternal] = React.useState<AppTab>("today")
  const active = activeProp ?? internal
  const select = (tab: AppTab) => {
    setInternal(tab)
    onTabChange?.(tab)
  }

  return (
    <nav
      data-slot="app-bottom-nav"
      className={cn(
        "absolute bottom-5 left-1/2 z-10 flex w-[311px] -translate-x-1/2 items-center justify-between",
        className
      )}
      {...props}
    >
      <button type="button" aria-label="Menu" className={circle}>
        <GripIcon className="size-6" strokeWidth={2} />
      </button>

      <div className="flex h-[60px] w-[181px] items-center justify-center gap-[5px] rounded-[30px] bg-app-field py-2.5 pr-3.5 pl-3">
        <Button
          variant={active === "today" ? "app" : "ghost"}
          onClick={() => select("today")}
          className="h-12 gap-1 px-[18px] text-base"
        >
          Today
          <ClockIcon
            className={cn("size-5", active === "today" && "fill-app-brand-foreground stroke-app-brand")}
            strokeWidth={2}
          />
        </Button>
        <Button
          variant={active === "explore" ? "app" : "ghost"}
          size="icon"
          aria-label="Explore"
          onClick={() => select("explore")}
          className="px-4"
        >
          <CircleDashedIcon className="size-5" />
        </Button>
      </div>

      <button type="button" aria-label="PREDICT assistant" className={circle}>
        <PredictMark className="h-[20px] w-[18px]" />
      </button>
    </nav>
  )
}

export { AppBottomNav, type AppTab }

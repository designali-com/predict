import * as React from "react"
import { ChevronLeftIcon, PlusIcon } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

import { Button } from "@workspace/ui/components/button"
import {
  AppCard,
  AppCardDescription,
  AppCardHeader,
  AppCardTitle,
} from "@workspace/ui/predict/app/app-card"
import { AppBottomNav } from "@workspace/ui/predict/app/app-bottom-nav"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"

import { Screen } from "../screen"

const devices = ["Apple Watch", "Samsung Galaxy Watch", "Fitbit Versa", "Garmin Forerunner"]

/** Apple logo tinted with the theme foreground (shared/apple.svg used as a mask). */
export function AppleMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-[15px] shrink-0 bg-app-foreground [mask:url(/screens/shared/apple.svg)_center/contain_no-repeat]",
        className
      )}
    />
  )
}

/** Back button + avatar header shared by the wearables flow. */
export function WearablesHeader() {
  return (
    <header className="flex items-start justify-between pt-[51px] pr-[47px] pl-10">
      <button
        type="button"
        aria-label="Back"
        className="mt-[18px] flex size-6 items-center justify-center"
      >
        <ChevronLeftIcon className="size-6" strokeWidth={1.5} />
      </button>
      <div className="size-[60px] shrink-0 overflow-hidden rounded-full border border-app-foreground bg-app-pill">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/screens/shared/avatar.png"
          alt="Arjun Vaidya"
          className="size-full object-cover object-top"
        />
      </div>
    </header>
  )
}

/** "Add a wearable" card listing the supported devices with a Connect button each. */
export function WearablesDeviceCard() {
  return (
    <div className="mt-[30px] px-[10.5px]">
      <AppCard>
        <AppCardHeader className="h-[60px]">
          <div>
            <AppCardTitle>Add a wearable</AppCardTitle>
            <AppCardDescription className="w-[165px]">
              Sleep, heart rate and HRV, beside your blood results.
            </AppCardDescription>
          </div>
        </AppCardHeader>
        {devices.map((device) => (
          <div key={device} className="flex h-7 items-center justify-between">
            <span className="flex items-center gap-1.5 text-base leading-5">
              <AppleMark />
              {device}
            </span>
            <Button
              variant="app"
              aria-label={`Connect ${device}`}
              className="h-[26px] w-[85px] gap-0.5 px-0 text-xs leading-6"
            >
              <PlusIcon className="size-3.5" />
              Connect
            </Button>
          </div>
        ))}
      </AppCard>
    </div>
  )
}

/** Bottom sheet frame (grab handle + centred title) used by the wearables flow. */
export function WearablesSheet({
  title,
  className,
  children,
}: {
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <AppCard
      role="dialog"
      aria-label={title}
      className={cn(
        "absolute left-1/2 z-20 w-[401px] -translate-x-1/2 items-center bg-app-surface px-[30px] py-5",
        className
      )}
    >
      <div className="h-[7px] w-[149px] shrink-0 rounded-[3.5px] bg-app-brand opacity-50" />
      <div className="flex w-full flex-col items-center text-center">
        <AppCardTitle>{title}</AppCardTitle>
        <AppCardDescription className="w-[165px]">
          Sleep, heart rate and HRV, beside your blood results.
        </AppCardDescription>
      </div>
      {children}
    </AppCard>
  )
}

export const title = "Add a wearable · devices"

// Figma: iPhone 18 Pro - 142 (1737:5408)
export default function Wearables02() {
  return (
    <Screen>
      <WearablesHeader />
      <WearablesDeviceCard />

      <AppGlow variant="fade" />
      <AppBottomNav />
    </Screen>
  )
}

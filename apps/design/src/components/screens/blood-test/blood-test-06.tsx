import { BadgeCheckIcon, ChevronRightIcon } from "lucide-react"

import { AppCard, AppCardDescription, AppCardTitle } from "@workspace/ui/predict/app/app-card"
import { AppBottomNav } from "@workspace/ui/predict/app/app-bottom-nav"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"

import { Screen } from "../screen"
import { BloodTestHeader } from "./blood-test-04"

const links = [
  { title: "Track your order", description: "Get a clearer picture of your health." },
  { title: "Booking details", description: "Get a clearer picture of your health." },
]

export const title = "Blood test booked"

// Figma: iPhone 18 Pro - 164 (1739:8032)
export default function BloodTest06() {
  return (
    <Screen>
      <BloodTestHeader />

      <div className="mt-[33px] px-[10.5px]">
        <AppCard className="h-[433px] items-center">
          <div className="flex h-[66px] w-[321px] flex-col items-center text-center">
            <AppCardTitle>Your Blood Test Booked</AppCardTitle>
            <AppCardDescription className="w-60">
              Get a clearer picture of your health with accurate blood testing and regular health
              monitoring.
            </AppCardDescription>
          </div>

          <div className="flex h-[141px] w-full items-center justify-center">
            <BadgeCheckIcon
              aria-label="Booking confirmed"
              className="size-[104px] fill-app-brand stroke-app-brand-foreground [&>path:first-child]:stroke-transparent"
              strokeWidth={0.92}
            />
          </div>

          {links.map((link) => (
            <button
              key={link.title}
              type="button"
              className="flex w-full items-center justify-between text-left"
            >
              <span className="flex flex-col">
                <span className="font-display text-[21px] leading-6">{link.title}</span>
                <span className="mt-2 text-[10px] leading-[14px]">{link.description}</span>
              </span>
              <ChevronRightIcon className="size-6 shrink-0" strokeWidth={1.5} />
            </button>
          ))}
        </AppCard>
      </div>

      <AppGlow variant="fade" />
      <AppBottomNav />
    </Screen>
  )
}

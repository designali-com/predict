import { ArrowUpRightIcon, BadgeCheckIcon, PlayIcon, PlusIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  AppCard,
  AppCardDescription,
  AppCardHeader,
  AppCardTitle,
} from "@workspace/ui/predict/app/app-card"
import { AppBottomNav } from "@workspace/ui/predict/app/app-bottom-nav"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"
import { AppGreeting } from "@workspace/ui/predict/app/app-greeting"

import { Screen } from "../screen"

const perks = [
  "Earliest collection in 60 minutes",
  "Reports Within 6 hours",
  "Reports verified by Doctors",
]

export const title = "Home · add a wearable"

// Figma: iPhone 18 Pro - 141 (1736:5153)
export default function Wearables01() {
  return (
    <Screen>
      <AppGreeting name="Arjun Vaidya" avatarSrc="/screens/shared/avatar.png" />

      <div className="mt-[41px] flex flex-col gap-3 px-[10.5px]">
        <AppCard className="h-[315px]">
          <AppCardHeader>
            <div>
              <AppCardTitle>Book Your Blood Test</AppCardTitle>
              <AppCardDescription>
                Get a clearer picture of your health with accurate blood testing and regular
                health monitoring.
              </AppCardDescription>
            </div>
          </AppCardHeader>
          <ul className="flex flex-col gap-1.5">
            {perks.map((perk) => (
              <li key={perk} className="flex h-7 items-center gap-1.5 text-xs leading-[14px]">
                <BadgeCheckIcon className="size-6 shrink-0" />
                {perk}
              </li>
            ))}
          </ul>
          <Button variant="app" size="lg" className="w-full text-base">
            Book Now
          </Button>
        </AppCard>

        <AppCard className="h-[176px]">
          <AppCardHeader>
            <div>
              <AppCardTitle>Add a wearable</AppCardTitle>
              <AppCardDescription>Start your 14 nights while you wait</AppCardDescription>
            </div>
          </AppCardHeader>
          <Button variant="app" size="lg" className="w-full text-base">
            <PlusIcon className="size-[18px]" />
            Connect
          </Button>
        </AppCard>

        <AppCard className="h-[297px] items-center px-2.5 pt-[30px] pb-2.5">
          <AppCardHeader className="w-[321px]">
            <AppCardTitle>Watch our product</AppCardTitle>
            <ArrowUpRightIcon className="size-6" />
          </AppCardHeader>
          <div className="relative h-[209px] w-[362px] overflow-hidden rounded-[30px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/screens/shared/product-video.png"
              alt="PREDICT product video"
              className="size-full object-cover"
            />
            <button
              type="button"
              aria-label="Play video"
              className="absolute inset-0 m-auto flex size-[78px] items-center justify-center text-white"
            >
              <PlayIcon className="size-8 fill-white" />
            </button>
          </div>
        </AppCard>
      </div>

      <AppGlow variant="fade" />
      <AppBottomNav />
    </Screen>
  )
}

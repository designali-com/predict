import { BadgeCheckIcon, ChevronLeftIcon } from "lucide-react"

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

const profiles = [
  "Included in Complete blood count",
  "Included in Anaemia profile",
  "Included in Liver profile",
  "Included in Kidney profile",
  "Included in Cholesterol",
]

export const title = "Blood test details"

function Price() {
  return (
    <div className="flex w-[321px] flex-col gap-5">
      <div className="flex items-center">
        <div className="flex h-8 w-[204px] items-end gap-1.5 leading-6">
          <span className="text-[36px] whitespace-nowrap">₹10,599</span>
          <span className="h-[18px] text-sm line-through">₹18,899</span>
        </div>
        <div className="flex h-8 w-[116px] items-end justify-end">
          <span className="text-[13px] leading-6">for one person</span>
        </div>
      </div>
      <p className="h-8 text-[10px] leading-[14px]">
        Take control of your health with a comprehensive Full Body Check-Up designed for early
        detection and complete peace of mind.
      </p>
    </div>
  )
}

// Figma: iPhone 18 Pro - 160 (1738:7178)
export default function BloodTest02() {
  return (
    <Screen>
      <header className="flex items-center justify-between pt-[51px] pr-[47px] pl-10">
        <button type="button" aria-label="Back" className="flex size-6 items-center justify-center">
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

      <div className="mt-[35px] flex flex-col gap-3 px-[10.5px]">
        <AppCard className="shrink-0">
          <AppCardHeader>
            <div>
              <AppCardTitle>Book Your Blood Test</AppCardTitle>
              <AppCardDescription>
                Get a clearer picture of your health with accurate blood testing and regular
                health monitoring.
              </AppCardDescription>
            </div>
          </AppCardHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/screens/blood-test/bt-02-blood-draw.png"
            alt="Phlebotomist collecting a blood sample at home"
            className="aspect-[736/414] w-full rounded-[30px] object-cover"
          />
          <Price />
          <Button variant="app" size="lg" className="w-full text-base">
            Book Now
          </Button>
        </AppCard>

        <AppCard className="shrink-0">
          <AppCardHeader>
            <div>
              <AppCardTitle className="whitespace-nowrap">
                What’s included in your checkup?
              </AppCardTitle>
              <AppCardDescription>
                Explore the 72 parameters grouped by health profile.
              </AppCardDescription>
            </div>
          </AppCardHeader>
          <ul className="flex flex-col gap-1.5">
            {profiles.map((item) => (
              <li key={item} className="flex h-7 items-center gap-1.5 text-xs leading-[14px]">
                <BadgeCheckIcon className="size-6 shrink-0" strokeWidth={1.5} />
                {item}
              </li>
            ))}
          </ul>
          <Price />
          <Button variant="app" size="lg" className="w-full text-base">
            Book Now
          </Button>
        </AppCard>
      </div>

      <AppGlow variant="fade" />
      <AppBottomNav />
    </Screen>
  )
}

import * as React from "react"
import { ChevronLeftIcon } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { AppCard, AppCardDescription, AppCardTitle } from "@workspace/ui/predict/app/app-card"
import { AppBottomNav } from "@workspace/ui/predict/app/app-bottom-nav"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"

import { Screen } from "../screen"

export const title = "Blood test · home collection"

/** Back button + avatar header of the blood test booking flow. */
export function BloodTestHeader() {
  return (
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
  )
}

const tabTrigger =
  "h-[31px] flex-none px-5 text-sm leading-5 text-app-foreground/60 data-active:bg-app-brand data-active:text-app-brand-foreground"

/** Visit Center | Home Collection segmented control. */
export function BloodTestTabs({ defaultValue = "home" }: { defaultValue?: "center" | "home" }) {
  return (
    <Tabs defaultValue={defaultValue} className="mt-[38px] items-center gap-0">
      <TabsList
        variant="line"
        className="h-auto gap-1 border-app-border bg-app-field px-1 py-[5px] group-data-horizontal/tabs:h-auto"
      >
        <TabsTrigger value="center" className={tabTrigger}>
          Visit Center
        </TabsTrigger>
        <TabsTrigger value="home" className={tabTrigger}>
          Home Collection
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-[321px] flex-col gap-[9px]">
      <p className="text-xs leading-[14px] text-app-foreground/60">{label}</p>
      {children}
    </div>
  )
}

/**
 * "Your Blood Test" home-collection summary: pincode check, earliest pickup,
 * address, bill and grand total. `actions` renders below the total.
 */
export function HomeCollectionCard({
  actions,
  className,
}: {
  actions: React.ReactNode
  className?: string
}) {
  return (
    <AppCard className={cn("shrink-0 items-center gap-3", className)}>
      <div className="h-[66px] w-full">
        <AppCardTitle>Your Blood Test</AppCardTitle>
        <AppCardDescription className="max-w-none">
          Get a clearer picture of your health with accurate blood testing and regular health
          monitoring.
        </AppCardDescription>
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          size="lg"
          aria-label="Pincode"
          inputMode="numeric"
          maxLength={6}
          defaultValue="110001"
          className="w-[161px] border-app-border bg-transparent! text-sm leading-5 text-app-foreground placeholder:text-app-foreground/40 focus-visible:border-app-accent focus-visible:ring-app-accent/30"
        />
        <Button variant="app-secondary" size="lg" className="px-6 text-sm leading-5">
          Check availability
        </Button>
      </div>

      <div className="flex h-[49px] w-[321px] flex-col justify-center">
        <Field label="Earliest Home Pickup">
          <p className="text-base leading-[14px]">18 November, 2026 - 08:00 AM</p>
        </Field>
      </div>

      <Field label="Deliver to">
        <p className="text-base leading-[22px]">
          F,38, opp. to McDonald, inside the market, South Extension I, Block F, New Delhi, Delhi
          110049
        </p>
      </Field>

      <Field label="Bill Details">
        <dl className="grid grid-cols-[1fr_auto] text-base leading-[22px]">
          <dt>Blood test</dt>
          <dd className="text-right">₹10,599</dd>
          <dt>GST</dt>
          <dd className="text-right">₹99</dd>
        </dl>
      </Field>

      <div className="flex h-[62px] w-[321px] items-center justify-between">
        <span className="text-base leading-[22px]">Grand Total</span>
        <span className="flex h-8 items-end text-2xl leading-6">₹10,599</span>
      </div>

      {actions}
    </AppCard>
  )
}

// Figma: iPhone 18 Pro - 162 (1739:7603)
export default function BloodTest04() {
  return (
    <Screen>
      <BloodTestHeader />
      <BloodTestTabs />

      <div className="mt-[13px] flex flex-col gap-3 px-[10.5px]">
        <HomeCollectionCard
          actions={
            <div className="flex items-center gap-1.5">
              <Button variant="app-secondary" size="lg" className="w-40 px-0 text-sm leading-5">
                Pay using Cred UPI
              </Button>
              <Button variant="app" size="lg" className="w-40 px-0 text-base">
                Book Now
              </Button>
            </div>
          }
        />
        <HomeCollectionCard
          actions={
            <Button variant="app" size="lg" className="w-[321px] text-base">
              Book Now
            </Button>
          }
        />
      </div>

      <AppGlow variant="fade" />
      <AppBottomNav />
    </Screen>
  )
}

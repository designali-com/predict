"use client"

import * as React from "react"
import { ChevronRightIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { AppCard, AppCardTitle } from "@workspace/ui/predict/app/app-card"
import { AppBottomNav } from "@workspace/ui/predict/app/app-bottom-nav"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"

import { Screen } from "../screen"
import { BloodTestHeader, BloodTestTabs, HomeCollectionCard } from "./blood-test-04"

export const title = "Blood test · payment method"

type Method = "cred" | "gpay" | "card" | "apple"

function CredMark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/screens/blood-test/bt-05-cred-upi.png"
      alt=""
      className="h-[23px] w-[22px] shrink-0 rounded-[5px] object-cover"
    />
  )
}

/** Apple logo tinted with the theme foreground (shared/apple.svg used as a mask). */
function AppleMark() {
  return (
    <span
      aria-hidden
      className="size-[15px] shrink-0 bg-app-foreground [mask:url(/screens/shared/apple.svg)_center/contain_no-repeat]"
    />
  )
}

const methods: { value: Method; label: string; icon?: React.ReactNode }[] = [
  { value: "cred", label: "Cred UPI", icon: <CredMark /> },
  { value: "gpay", label: "Google Pay" },
  { value: "card", label: "Add Credit Card" },
  { value: "apple", label: "Apple Pay", icon: <AppleMark /> },
]

// Figma: iPhone 18 Pro - 163 (1739:7737)
export default function BloodTest05() {
  const [method, setMethod] = React.useState<Method>("cred")

  return (
    <Screen>
      <BloodTestHeader />
      <BloodTestTabs />

      <div className="mt-[13px] flex flex-col px-[10.5px]">
        <HomeCollectionCard
          actions={
            <>
              <Button variant="app" size="lg" className="w-[321px] text-base">
                Book Now
              </Button>
              <button
                type="button"
                className="text-center text-xs leading-[14px] text-app-foreground/60 underline"
              >
                Cancel policy
              </button>
            </>
          }
        />
      </div>

      <AppGlow variant="fade" />
      <AppBottomNav />

      {/* Bottom sheet */}
      <AppCard
        role="dialog"
        aria-label="Select payment method"
        className="absolute top-[483px] left-px z-20 h-[681px] w-[401px] items-center bg-app-surface/80 px-[30px] py-5 backdrop-blur-xl"
      >
        <div aria-hidden className="h-[7px] w-[149px] shrink-0 rounded-[3.5px] bg-app-accent/50" />
        <AppCardTitle className="h-[29px] w-full text-center">Select payment method</AppCardTitle>

        <div role="radiogroup" aria-label="Payment method" className="flex w-full flex-col gap-6">
          {methods.map(({ value, label, icon }) => {
            const selected = method === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMethod(value)}
                className="flex h-6 w-full items-center gap-2 text-left text-base leading-5"
              >
                {icon}
                <span className="flex-1">{label}</span>
                {selected ? (
                  <span className="flex h-[23px] w-[77px] items-center justify-center rounded-[40px] bg-app-field text-xs leading-6">
                    Selected
                  </span>
                ) : (
                  <ChevronRightIcon className="size-6 shrink-0" strokeWidth={1.5} />
                )}
              </button>
            )
          })}
        </div>

        <Button variant="app" size="lg" className="w-[321px] text-base">
          Continue
        </Button>
      </AppCard>
    </Screen>
  )
}

"use client"

import * as React from "react"
import { ChevronLeftIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"

import { Screen } from "../screen"

export const title = "Chronic conditions"

// Figma: iPhone 18 Pro - 157 (1737:6783)
export default function Onboarding03() {
  const [answer, setAnswer] = React.useState<"yes" | "no" | null>(null)

  return (
    <Screen>
      <AppGlow variant="blob" />

      <button type="button" aria-label="Back" className="absolute top-[69px] left-10">
        <ChevronLeftIcon className="size-6" strokeWidth={1.5} />
      </button>

      {/* Step progress — step 2 of 3 */}
      <div className="absolute top-[78px] left-1/2 flex w-[215px] -translate-x-[calc(50%+0.5px)] gap-[7px]">
        <span className="h-1.5 w-[67px] rounded-[3px] bg-app-brand" />
        <span className="h-1.5 w-[67px] rounded-[3px] bg-app-brand" />
        <span className="h-1.5 w-[66px] rounded-[3px] bg-app-pill" />
      </div>

      <div className="relative flex flex-col px-14 pt-[132px]">
        <h1 className="w-[318px] font-display text-2xl leading-[29px] font-normal">
          Have you been diagnosed with any chronic conditions?
        </h1>
        <p className="mt-[19px] w-[289px] text-base leading-[22px]">
          For example: Diabetes, Obesity, Anxiety, Depression, Hypertension, Asthma, etc.
        </p>

        <div role="radiogroup" aria-label="Diagnosed" className="mt-[55px] flex gap-[7px]">
          {(["yes", "no"] as const).map((value) => (
            <Button
              key={value}
              role="radio"
              aria-checked={answer === value}
              variant="outline"
              size="lg"
              onClick={() => setAnswer(value)}
              className={cn(
                "flex-1 text-sm text-app-foreground capitalize",
                answer === value && "border-app-accent bg-app-pill hover:bg-app-pill"
              )}
            >
              {value}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative mt-auto flex flex-col items-center gap-2 pb-[77px]">
        <Button variant="app" size="lg" className="w-[290px] text-base">
          Continue
        </Button>
        <Button variant="app-secondary" size="lg" className="w-[290px] text-sm">
          Skip
        </Button>
      </div>
    </Screen>
  )
}

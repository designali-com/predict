"use client"

import * as React from "react"
import { ChevronLeftIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"

import { Screen } from "../screen"

export const title = "Gender"

const options = ["Male", "Female", "Other"]

// Figma: iPhone 18 Pro - 158 (1737:6816)
export default function Onboarding02() {
  const [gender, setGender] = React.useState<string | null>(null)

  return (
    <Screen>
      <AppGlow variant="blob" />

      <button type="button" aria-label="Back" className="absolute top-[69px] left-10">
        <ChevronLeftIcon className="size-6" strokeWidth={1.5} />
      </button>

      {/* Step progress — step 1 of 3 */}
      <div className="absolute top-[78px] left-1/2 flex w-[215px] -translate-x-[calc(50%+0.5px)] gap-[7px]">
        <span className="h-1.5 w-[67px] rounded-[3px] bg-app-brand" />
        <span className="h-1.5 w-[67px] rounded-[3px] bg-app-pill" />
        <span className="h-1.5 w-[66px] rounded-[3px] bg-app-pill" />
      </div>

      <div className="relative flex flex-col items-center pt-[174px]">
        <h1 className="font-display text-2xl leading-[29px] font-normal">Gender</h1>

        <div role="radiogroup" aria-label="Gender" className="mt-[18px] flex flex-col gap-2.5">
          {options.map((option) => (
            <Button
              key={option}
              role="radio"
              aria-checked={gender === option}
              variant="outline"
              size="lg"
              onClick={() => setGender(option)}
              className={cn(
                "w-[290px] text-sm text-app-foreground",
                gender === option && "border-app-accent bg-app-pill hover:bg-app-pill"
              )}
            >
              {option}
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

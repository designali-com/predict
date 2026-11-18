"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"

import { Screen } from "../screen"

export const title = "Date of birth"

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

// Figma: iPhone 18 Pro - 155 (1737:6689)
export default function Onboarding01() {
  const [dob, setDob] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  return (
    <Screen>
      <AppGlow variant="blob" />

      {/* Step progress — nothing completed yet */}
      <div className="absolute top-[78px] left-1/2 flex w-[215px] -translate-x-[calc(50%+0.5px)] gap-[7px]">
        <span className="h-1.5 w-[67px] rounded-[3px] bg-app-pill" />
        <span className="h-1.5 w-[67px] rounded-[3px] bg-app-pill" />
        <span className="h-1.5 w-[66px] rounded-[3px] bg-app-pill" />
      </div>

      <div className="relative flex flex-col items-center pt-[174px]">
        <h1 className="font-display text-2xl leading-[29px] font-normal">Date of Birth</h1>

        <label className="relative mt-[18px] flex h-12 w-[290px] cursor-pointer items-center justify-between rounded-full border border-app-border px-6 text-sm leading-5 text-app-foreground">
          <span className={dob ? undefined : "opacity-40"}>
            {dob ? formatDate(dob) : "Pick a date"}
          </span>
          <CalendarIcon className="size-[21px] opacity-40" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="date"
            aria-label="Date of birth"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            onClick={() => inputRef.current?.showPicker?.()}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
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

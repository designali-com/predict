"use client"

import * as React from "react"
import { ChevronLeftIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"

import { Screen } from "../screen"

export const title = "Select conditions"

/**
 * Condition chips laid out as in Figma: four staggered rows that bleed off
 * both edges of the screen (clipped by <Screen>). `x` is the left offset in px.
 * Labels repeat across rows, so selection is keyed by label.
 */
const rows: { top: number; chips: { label: string; x: number }[] }[] = [
  {
    top: 434,
    chips: [
      { label: "Thyroid Disorder", x: -83 },
      { label: "Diabetes", x: 56 },
      { label: "Prediabetes", x: 154 },
      { label: "Obesity", x: 269 },
      { label: "High Cholesterol", x: 361 },
    ],
  },
  {
    top: 475,
    chips: [
      { label: "High Blood Pressure", x: -31 },
      { label: "High Cholesterol", x: 129 },
      { label: "Thyroid Disorder", x: 269 },
    ],
  },
  {
    top: 516,
    chips: [
      { label: "Heart Disease", x: -74 },
      { label: "Heart Disease", x: 53 },
      { label: "Coronary Artery Disease", x: 182 },
      { label: "PCOS / PCOD", x: 363 },
    ],
  },
  {
    top: 557,
    chips: [
      { label: "Thyroid Disorder", x: -27 },
      { label: "Diabetes", x: 112 },
      { label: "Prediabetes", x: 210 },
      { label: "Obesity", x: 325 },
      { label: "High Cholesterol", x: 417 },
    ],
  },
]

// Figma: iPhone 18 Pro - 156 (1737:6746)
export default function Onboarding04() {
  const [answer, setAnswer] = React.useState<"yes" | "no" | null>(null)
  const [conditions, setConditions] = React.useState<Set<string>>(() => new Set())

  const toggle = (label: string) =>
    setConditions((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })

  return (
    <Screen>
      <AppGlow variant="blob" />

      <button type="button" aria-label="Back" className="absolute top-[69px] left-10">
        <ChevronLeftIcon className="size-6" strokeWidth={1.5} />
      </button>

      {/* Step progress — step 3 of 3 */}
      <div className="absolute top-[78px] left-1/2 flex w-[215px] -translate-x-[calc(50%+0.5px)] gap-[7px]">
        <span className="h-1.5 w-[67px] rounded-[3px] bg-app-brand" />
        <span className="h-1.5 w-[67px] rounded-[3px] bg-app-brand" />
        <span className="h-1.5 w-[66px] rounded-[3px] bg-app-brand" />
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
                "flex-1 border-app-border text-sm text-app-foreground capitalize",
                answer === value && "border-app-accent bg-app-pill hover:bg-app-pill"
              )}
            >
              {value}
            </Button>
          ))}
        </div>

        <p className="mt-[43px] w-[289px] text-xs">
          Select all conditions you&apos;ve been diagnosed with:
        </p>
      </div>

      {/* In flow, so the chips follow the copy above if it wraps differently */}
      <div role="group" aria-label="Conditions" className="relative mt-4 h-[155px] shrink-0">
        {rows.map((row) =>
          row.chips.map((chip) => {
            const selected = conditions.has(chip.label)
            return (
              <Button
                key={`${row.top}-${chip.x}`}
                aria-pressed={selected}
                variant="outline"
                size="sm"
                onClick={() => toggle(chip.label)}
                style={{ top: row.top - rows[0]!.top, left: chip.x }}
                className={cn(
                  "absolute border-app-border text-xs text-app-foreground",
                  selected && "border-app-accent bg-app-pill hover:bg-app-pill"
                )}
              >
                {chip.label}
              </Button>
            )
          })
        )}
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

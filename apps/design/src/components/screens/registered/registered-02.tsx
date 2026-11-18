"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { AppCard } from "@workspace/ui/predict/app/app-card"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"
import { PredictMark } from "@workspace/ui/predict/logo"

import { Screen } from "../screen"

export const title = "Your choices"

const choices = [
  { id: "ai-read", label: "Predict AI can read my record", defaultOn: true },
  { id: "whatsapp", label: "WhatsApp reminders", defaultOn: false },
  { id: "research", label: "Research, name removed", defaultOn: false },
  { id: "keep-reports", label: "Keep my reports and guide me", defaultOn: true },
]

// Figma: iPhone 18 Pro - 138 (1733:3897)
export default function Registered02() {
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(choices.map((c) => [c.id, c.defaultOn]))
  )

  return (
    <Screen className="items-center">
      <AppGlow variant="blob" />

      <PredictMark className="relative mt-[82px] h-[72px] w-16 text-app-accent" />

      <h1 className="relative mt-[78px] text-center font-display text-[40px] leading-[1.1] font-normal">
        Your choices
      </h1>
      <p className="relative mt-[11px] w-[313px] text-center text-base leading-[19px]">
        Change any time in You.
      </p>

      <AppCard className="mt-10 h-[280px] w-[245px] justify-between gap-0">
        {choices.map((choice) => (
          <label key={choice.id} className="flex min-h-[26px] items-center justify-between gap-3">
            <span className="w-[109px] text-xs leading-[14px]">{choice.label}</span>
            <Switch
              checked={enabled[choice.id]}
              onCheckedChange={(checked) =>
                setEnabled((prev) => ({ ...prev, [choice.id]: checked }))
              }
              className="data-checked:bg-app-brand data-unchecked:bg-app-track"
            />
          </label>
        ))}
      </AppCard>

      <Button variant="app" size="lg" className="relative mt-[39px] w-[290px] text-base">
        Agree and continue
      </Button>
      <button
        type="button"
        className="relative mt-3 flex h-12 w-[290px] items-center justify-center text-sm leading-5 text-white underline"
      >
        Read the full notice
      </button>
    </Screen>
  )
}

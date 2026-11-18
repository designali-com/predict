"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"

import { Screen } from "../screen"
import { WearablesDeviceCard, WearablesHeader, WearablesSheet } from "./wearables-02"

const metrics = [
  { id: "sleep", label: "Sleep", hint: "Last night, and your daily score", on: true },
  { id: "heart-rate", label: "Heart rate", hint: "Compared with your own usual", on: false },
  { id: "activity", label: "Steps and exercise", hint: "For your brief and plans", on: true },
  { id: "hrv", label: "Heart rate variability", hint: "A recovery signal", on: true },
  { id: "walk", label: "Walk", hint: "daily steps", on: true },
]

export const title = "Add a wearable · data permissions"

// Figma: iPhone 18 Pro - 147 (1737:6145)
export default function Wearables04() {
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(metrics.map((metric) => [metric.id, metric.on]))
  )

  return (
    <Screen>
      <WearablesHeader />
      <WearablesDeviceCard />

      <WearablesSheet title="What Predict reads, and why" className="top-[307px] h-[681px]">
        {metrics.map((metric) => (
          <label
            key={metric.id}
            htmlFor={`wearables-04-${metric.id}`}
            className="flex w-full cursor-pointer items-center justify-between"
          >
            <span className="flex flex-col gap-1 leading-5">
              <span className="text-base">{metric.label}</span>
              <span className="text-xs">{metric.hint}</span>
            </span>
            <Switch
              id={`wearables-04-${metric.id}`}
              checked={enabled[metric.id]}
              onCheckedChange={(checked) =>
                setEnabled((prev) => ({ ...prev, [metric.id]: checked }))
              }
              className="data-checked:bg-app-brand data-unchecked:bg-app-track"
            />
          </label>
        ))}
        <Button variant="app" size="lg" className="w-[321px] text-base">
          Continue
        </Button>
      </WearablesSheet>
    </Screen>
  )
}

"use client"

import { GaugeCombined } from "@workspace/ui/components/gauge"

export function GaugeSizes() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <GaugeCombined
        value={45}
        size={96}
        segments={30}
        tickInnerRadius={30}
        className="[&>div]:text-base"
        aria-label="Small gauge"
      />
      <GaugeCombined
        value={45}
        size={140}
        segments={45}
        className="[&>div]:text-xl"
        aria-label="Medium gauge"
      />
      <GaugeCombined value={45} aria-label="Large gauge" />
    </div>
  )
}

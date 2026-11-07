"use client"

import { CircularProgressCombined } from "@workspace/ui/components/circular-progress"

export function CircularProgressSizes() {
  return (
    <div className="flex items-center gap-6">
      <CircularProgressCombined
        value={40}
        size={80}
        thickness={8}
        className="[&_span]:text-[10px]"
        aria-label="Small"
      />
      <CircularProgressCombined value={60} aria-label="Default" />
      <CircularProgressCombined
        value={80}
        size={200}
        thickness={24}
        className="[&_span]:text-3xl"
        aria-label="Large"
      />
    </div>
  )
}

"use client"

import {
  Marquee,
  MarqueeContent,
  MarqueeEdge,
  MarqueeItem,
} from "@workspace/ui/components/marquee"

const updates = [
  "Results ready: Vitamin D",
  "New report: Heart health",
  "Reminder: Retest in 3 months",
  "Results ready: Thyroid panel",
  "New report: Metabolic health",
]

export function MarqueeVertical() {
  return (
    <div className="h-64 w-full max-w-xs">
      <Marquee side="top" speed={30} aria-label="Recent updates">
        <MarqueeContent>
          {updates.map((update) => (
            <MarqueeItem
              key={update}
              className="rounded-lg border px-4 py-3 text-sm"
            >
              {update}
            </MarqueeItem>
          ))}
        </MarqueeContent>
        <MarqueeEdge side="top" />
        <MarqueeEdge side="bottom" />
      </Marquee>
    </div>
  )
}

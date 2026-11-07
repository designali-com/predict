"use client"

import {
  Marquee,
  MarqueeContent,
  MarqueeEdge,
  MarqueeItem,
} from "@workspace/ui/components/marquee"

const markers = [
  "Vitamin D",
  "Ferritin",
  "HbA1c",
  "LDL",
  "HDL",
  "hs-CRP",
  "TSH",
  "Testosterone",
  "Cortisol",
  "B12",
]

export function MarqueeDemo() {
  return (
    <Marquee className="w-full max-w-lg" aria-label="Biomarkers we test">
      <MarqueeContent>
        {markers.map((marker) => (
          <MarqueeItem
            key={marker}
            className="rounded-full border px-4 py-2 text-sm font-medium"
          >
            {marker}
          </MarqueeItem>
        ))}
      </MarqueeContent>
      <MarqueeEdge side="left" />
      <MarqueeEdge side="right" />
    </Marquee>
  )
}

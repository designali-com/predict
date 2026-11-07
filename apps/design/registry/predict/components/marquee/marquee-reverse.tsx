"use client"

import {
  Marquee,
  MarqueeContent,
  MarqueeEdge,
  MarqueeItem,
} from "@workspace/ui/components/marquee"

const rowOne = ["Sleep", "Energy", "Focus", "Recovery", "Mood"]
const rowTwo = ["Heart", "Thyroid", "Liver", "Kidney", "Hormones"]

function Row({ items, reverse }: { items: string[]; reverse?: boolean }) {
  return (
    <Marquee reverse={reverse} autoFill speed={35}>
      <MarqueeContent>
        {items.map((item) => (
          <MarqueeItem
            key={item}
            className="rounded-full bg-secondary px-4 py-1.5 text-sm text-secondary-foreground"
          >
            {item}
          </MarqueeItem>
        ))}
      </MarqueeContent>
      <MarqueeEdge side="left" size="sm" />
      <MarqueeEdge side="right" size="sm" />
    </Marquee>
  )
}

export function MarqueeReverse() {
  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <Row items={rowOne} />
      <Row items={rowTwo} reverse />
    </div>
  )
}

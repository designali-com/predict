"use client"

import {
  Marquee,
  MarqueeContent,
  MarqueeEdge,
  MarqueeItem,
} from "@workspace/ui/components/marquee"

const reviews = [
  { name: "Amira", quote: "Finally understood my results." },
  { name: "Jonas", quote: "The retest reminders keep me on track." },
  { name: "Priya", quote: "Clear, calm and quick." },
  { name: "Leo", quote: "My doctor loved the report." },
]

export function MarqueePause() {
  return (
    <Marquee
      pauseOnHover
      pauseOnKeyboard
      speed={40}
      className="w-full max-w-lg"
      aria-label="Member reviews"
    >
      <MarqueeContent>
        {reviews.map((review) => (
          <MarqueeItem
            key={review.name}
            className="flex w-64 flex-col gap-1 rounded-lg border p-4"
          >
            <span className="text-sm">“{review.quote}”</span>
            <span className="text-xs text-muted-foreground">
              {review.name}
            </span>
          </MarqueeItem>
        ))}
      </MarqueeContent>
      <MarqueeEdge side="left" size="sm" />
      <MarqueeEdge side="right" size="sm" />
    </Marquee>
  )
}

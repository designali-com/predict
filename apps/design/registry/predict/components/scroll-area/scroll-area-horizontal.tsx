"use client"

import { ScrollArea, ScrollBar } from "@workspace/ui/components/scroll-area"

const panels = [
  { month: "Jan", score: 72 },
  { month: "Mar", score: 75 },
  { month: "May", score: 74 },
  { month: "Jul", score: 79 },
  { month: "Sep", score: 81 },
  { month: "Nov", score: 83 },
]

export function ScrollAreaHorizontal() {
  return (
    <ScrollArea className="w-full max-w-sm rounded-md border">
      <div className="flex w-max gap-3 p-4">
        {panels.map((panel) => (
          <div key={panel.month} className="grid w-28 gap-1 rounded-md border p-3">
            <span className="text-xs text-muted-foreground">{panel.month} panel</span>
            <span className="text-xl font-medium tabular-nums">{panel.score}</span>
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

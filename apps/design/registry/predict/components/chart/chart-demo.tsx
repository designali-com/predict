"use client"

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui/components/chart"

const data = [
  { month: "May", steps: 7400 },
  { month: "Jun", steps: 8100 },
  { month: "Jul", steps: 9200 },
  { month: "Aug", steps: 8700 },
  { month: "Sep", steps: 10300 },
  { month: "Oct", steps: 11000 },
]

const chartConfig = {
  steps: {
    label: "Daily steps",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig

export function ChartDemo() {
  return (
    <ChartContainer config={chartConfig} className="h-56 w-full max-w-md">
      <BarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="steps" fill="var(--color-steps)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}

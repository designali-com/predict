"use client"

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui/components/chart"

const data = [
  { month: "May", deep: 1.2, rem: 1.6 },
  { month: "Jun", deep: 1.3, rem: 1.7 },
  { month: "Jul", deep: 1.1, rem: 1.5 },
  { month: "Aug", deep: 1.4, rem: 1.8 },
  { month: "Sep", deep: 1.5, rem: 1.9 },
  { month: "Oct", deep: 1.6, rem: 2.0 },
]

const chartConfig = {
  deep: {
    label: "Deep sleep (h)",
    color: "var(--chart-5)",
  },
  rem: {
    label: "REM sleep (h)",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

export function ChartLegendDemo() {
  return (
    <ChartContainer config={chartConfig} className="h-60 w-full max-w-md">
      <AreaChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          dataKey="rem"
          type="natural"
          stackId="sleep"
          fill="var(--color-rem)"
          fillOpacity={0.4}
          stroke="var(--color-rem)"
        />
        <Area
          dataKey="deep"
          type="natural"
          stackId="sleep"
          fill="var(--color-deep)"
          fillOpacity={0.4}
          stroke="var(--color-deep)"
        />
      </AreaChart>
    </ChartContainer>
  )
}

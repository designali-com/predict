"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui/components/chart"

const data = [
  { date: "Jan", ldl: 142 },
  { date: "Mar", ldl: 131 },
  { date: "May", ldl: 118 },
  { date: "Jul", ldl: 109 },
  { date: "Sep", ldl: 101 },
  { date: "Oct", ldl: 96 },
]

const chartConfig = {
  ldl: {
    label: "LDL-C (mg/dL)",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig

export function ChartLine() {
  return (
    <ChartContainer config={chartConfig} className="h-56 w-full max-w-md">
      <LineChart accessibilityLayer data={data} margin={{ left: 0, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          width={32}
          tickLine={false}
          axisLine={false}
          domain={[80, 150]}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator="line" />}
        />
        <Line
          dataKey="ldl"
          type="monotone"
          stroke="var(--color-ldl)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  )
}

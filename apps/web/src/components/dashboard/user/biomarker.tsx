"use client"

import React from "react"
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts"

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@workspace/ui/components/chart"

import {
  IN_RANGE_Z,
  formatValue,
  referenceRange,
  type DashboardBiomarker,
} from "./dashboard-data"

export const description =
  "How far each measured biomarker sits from its own reference range"

export interface BiomarkerProfileProps {
  biomarkers: DashboardBiomarker[]
}

const chartConfig = {
  deviation: { label: "Distance from range", color: "var(--primary)" },
  limit: { label: "Range edge", color: "var(--muted-foreground)" },
} satisfies ChartConfig

/**
 * One spoke per measured marker, plotted as |Z| — distance from the middle of
 * its own reference range, in units of a quarter of that range.
 *
 * The chart this replaced plotted a "score" out of 100 for nineteen markers,
 * none of which had been measured and none of which had a formula behind the
 * number. |Z| is plotted instead because it is the quantity the biological
 * age is actually built from, and because markers in different units (mg/dL,
 * %, a ratio) cannot otherwise share an axis.
 *
 * The dashed ring at 2 is the edge of the reference range: sd is a quarter of
 * the range, so |Z| = 2 is exactly the high or low limit. Inside the ring is
 * normal, outside it is not — which is the one thing a patient needs to read
 * off this without being told a scale.
 */
function BiomarkerProfileImpl({ biomarkers }: BiomarkerProfileProps) {
  const scored = biomarkers.filter((b) => b.z != null)

  const chartData = scored.map((b) => ({
    biomarker: b.shortCode,
    deviation: Number(Math.abs(b.z!).toFixed(2)),
    limit: IN_RANGE_Z,
    marker: b,
  }))

  const outside = scored.filter((b) => b.status !== "Normal")
  const worst = chartData.length ? Math.max(...chartData.map((d) => d.deviation)) : 0

  return (
    // h-full so this card matches the one beside it in the grid row —
    // they are two halves of one answer and a ragged edge reads as a bug.
    <Card className="flex h-full max-w-xl flex-col bg-transparent">
      <CardHeader className="items-center pb-4">
        <CardTitle>Biomarker Profile</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 items-center justify-center pb-0">
        {chartData.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            No biomarker readings with a reference range yet.
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square max-h-[450px] w-full"
          >
            <RadarChart data={chartData}>
              <ChartTooltip
                cursor={false}
                content={({ active, payload }) => {
                  const marker = (payload?.[0]?.payload as { marker?: DashboardBiomarker })?.marker
                  if (!active || !marker) return null
                  return (
                    <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <div className="font-medium">{marker.name}</div>
                      <div className="text-muted-foreground">
                        {formatValue(marker.value)}
                        {marker.unit ? ` ${marker.unit}` : ""} · {marker.status}
                      </div>
                      <div className="text-muted-foreground">
                        Range {referenceRange(marker)}
                      </div>
                    </div>
                  )
                }}
              />

              <PolarGrid gridType="circle" />

              <PolarAngleAxis dataKey="biomarker" tick={{ fontSize: 12 }} />

              {/* Both series must share one scale or the range ring lies. */}
              <PolarRadiusAxis domain={[0, Math.max(worst, IN_RANGE_Z)]} tick={false} axisLine={false} />

              <Radar
                name="Range edge"
                dataKey="limit"
                fill="none"
                stroke="var(--color-limit)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />

              <Radar
                name="Distance from range"
                dataKey="deviation"
                fill="var(--color-deviation)"
                fillOpacity={0.25}
                stroke="var(--color-deviation)"
                strokeWidth={2}
                dot={{ r: 4, fill: "var(--color-deviation)", fillOpacity: 1 }}
              />
            </RadarChart>
          </ChartContainer>
        )}
      </CardContent>

      <CardFooter className="flex-col gap-2 text-sm">
        {chartData.length > 0 && (
          <>
            <div className="flex items-center gap-2 font-medium leading-none">
              {outside.length === 0
                ? "Every measured marker is inside its range"
                : `${outside.length} of ${scored.length} marker${
                    scored.length === 1 ? "" : "s"
                  } outside range`}
            </div>
            <div className="leading-none text-muted-foreground">
              Dashed ring is the edge of the reference range — inside is normal.
            </div>
          </>
        )}
      </CardFooter>
    </Card>
  )
}

export const BiomarkerProfile = React.memo(BiomarkerProfileImpl)

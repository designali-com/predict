"use client"

import * as React from "react"
import { cn } from "cn"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  flagValue,
  formatReferenceRange,
  isConcern,
  rangeDirectionLabels,
  rangeFlagLabels,
  zScore,
  type RangeDirection,
  type RangeFlag,
  type ReferenceRange as Range,
} from "@workspace/ui/lib/reference-range"

/** A step on the theme's status scale, or none for no concern. */
export type RangeTone =
  | "normal"
  | "mild"
  | "moderate"
  | "severe"
  | "extreme"
  | "none"

/**
 * The status colour for a result. In range is normal and the harmless side
 * of a directional range is none. Otherwise critical flags are extreme and
 * the rest step up with |Z|: under 3 mild, under 4 moderate, under 5 severe,
 * then extreme. Without a Z-score, out of range is mild.
 */
export function rangeTone(
  flag: RangeFlag,
  z: number | null,
  direction?: RangeDirection
): RangeTone {
  if (flag === "normal") return "normal"
  if (!isConcern(flag, direction)) return "none"
  if (flag === "critical-low" || flag === "critical-high") return "extreme"
  if (flag === "abnormal") return "severe"
  if (z === null) return "mild"
  const size = Math.abs(z)
  if (size < 3) return "mild"
  if (size < 4) return "moderate"
  if (size < 5) return "severe"
  return "extreme"
}

const toneBadge: Record<RangeTone, string> = {
  normal: "bg-status-normal/15 text-status-normal",
  mild: "bg-status-mild/15 text-status-mild",
  moderate: "bg-status-moderate/15 text-status-moderate",
  severe: "bg-status-severe/15 text-status-severe",
  extreme: "bg-status-extreme/15 text-status-extreme",
  none: "bg-muted text-muted-foreground",
}

const toneText: Record<RangeTone, string> = {
  normal: "",
  mild: "text-status-mild",
  moderate: "text-status-moderate",
  severe: "text-status-severe",
  extreme: "text-status-extreme",
  none: "",
}

const toneFill: Record<RangeTone, string> = {
  normal: "bg-status-normal",
  mild: "bg-status-mild",
  moderate: "bg-status-moderate",
  severe: "bg-status-severe",
  extreme: "bg-status-extreme",
  none: "bg-border",
}

function formatValue(value: number | string, decimals?: number) {
  if (typeof value !== "number") return value
  return decimals === undefined ? String(value) : value.toFixed(decimals)
}

type Segment = { from: number; to: number; tone: RangeTone }

/**
 * The bar's scale and coloured zones. Padded past the outermost limit and the
 * value so the marker never sits on an edge. Null when there is nothing to
 * place the value against.
 */
function rangeScale(value: number, range: Range) {
  const { low, high, criticalLow, criticalHigh, direction } = range
  const limits = [criticalLow, low, high, criticalHigh].filter(
    (n): n is number => n !== undefined
  )
  if (low === undefined && high === undefined) return null

  const span = Math.max(...limits, value) - Math.min(...limits, value)
  const pad = Math.max(span * 0.25, Math.abs(high ?? low ?? 1) * 0.1)
  let min = Math.min(...limits, value) - pad
  const max = Math.max(...limits, value) + pad
  // A range with only an upper limit, such as "≤ 200", starts at zero.
  if (low === undefined && criticalLow === undefined && value >= 0)
    min = Math.max(0, min)

  // The harmless side of a directional range is greyed out.
  const below = (tone: RangeTone) => (direction === "high" ? "none" : tone)
  const above = (tone: RangeTone) => (direction === "low" ? "none" : tone)

  const edges: { at: number; tone: RangeTone }[] = []
  if (criticalLow !== undefined)
    edges.push({
      at: criticalLow,
      tone: low !== undefined ? below("mild") : "normal",
    })
  if (low !== undefined) edges.push({ at: low, tone: "normal" })
  if (high !== undefined) edges.push({ at: high, tone: above("mild") })
  if (criticalHigh !== undefined)
    edges.push({ at: criticalHigh, tone: above("extreme") })

  const first: RangeTone =
    criticalLow !== undefined
      ? below("extreme")
      : low !== undefined
        ? below("mild")
        : "normal"
  const segments: Segment[] = []
  let from = min
  let tone: RangeTone = first
  for (const edge of edges) {
    if (edge.at > from) segments.push({ from, to: edge.at, tone })
    from = Math.max(from, edge.at)
    tone = edge.tone
  }
  segments.push({ from, to: max, tone })

  return { min, max, segments }
}

function RangeBar({ value, range }: { value: number; range: Range }) {
  const scale = rangeScale(value, range)
  if (!scale) return null
  const { min, max, segments } = scale
  const at = (n: number) => ((n - min) / (max - min)) * 100

  return (
    <div className="relative py-1.5" aria-hidden="true">
      <div className="flex h-6 gap-0.5 overflow-hidden rounded-full">
        {segments.map((segment) => (
          <div
            key={segment.from}
            className={cn(
              toneFill[segment.tone],
              segment.tone !== "normal" && "opacity-100"
            )}
            style={{ width: `${at(segment.to) - at(segment.from)}%` }}
          />
        ))}
      </div>
      <div
        className="absolute top-1/2 size-8 shadow-sm -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary-foreground bg-primary transition-[left]"
        style={{ left: `${Math.min(100, Math.max(0, at(value)))}%` }}
      />
    </div>
  )
}

export interface ReferenceRangeProps extends React.ComponentProps<typeof Card> {
  /** The test name, such as "Glucose" or "hs-CRP". */
  name: string
  /** A longer name under the title, such as "High-sensitivity C-reactive protein". */
  description?: string
  value: number | string
  unit?: string
  range?: Range
  /** Decimal places for the value and the range. */
  decimals?: number
  /**
   * Overrides the computed flag, for example "abnormal" for a text result
   * that does not match its expected text.
   */
  flag?: RangeFlag
}

function ReferenceRange({
  className,
  name,
  description,
  value,
  unit,
  range,
  decimals,
  flag: flagOverride,
  ...props
}: ReferenceRangeProps) {
  const flag = flagOverride ?? flagValue(value, range)
  const z = zScore(value, range)
  const tone = rangeTone(flag, z, range?.direction)
  const rangeText = formatReferenceRange(range, decimals)
  const numeric = typeof value === "number" && !Number.isNaN(value)

  return (
    <Card
      size="sm"
      data-slot="reference-range"
      data-flag={flag}
      data-tone={tone}
      className={cn("w-full max-w-sm", className)}
      {...props}
    >
      <CardHeader>
        <CardTitle className="text-sm">{name}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
              toneBadge[tone]
            )}
          >
            {rangeFlagLabels[flag]}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-baseline gap-1">
            <span
              className={cn("text-2xl font-semibold tabular-nums", toneText[tone])}
            >
              {formatValue(value, decimals)}
            </span>
            {unit && <span className="text-muted-foreground">{unit}</span>}
          </span>
          {rangeText && (
            <span className="text-muted-foreground tabular-nums">
              Ref {rangeText}
              {unit && !range?.text ? ` ${unit}` : ""}
            </span>
          )}
        </div>
        {numeric && range && <RangeBar value={value} range={range} />}
        {(z !== null || range?.direction) && (
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="tabular-nums">
              {z !== null && (
                <>
                  Z{" "}
                  <span className={cn("font-medium text-foreground", toneText[tone])}>
                    {z > 0 ? "+" : ""}
                    {z.toFixed(2)}
                  </span>
                </>
              )}
            </span>
            {range?.direction && (
              <span>{rangeDirectionLabels[range.direction]}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { ReferenceRange }

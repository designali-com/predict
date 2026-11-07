"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

const GAUGE_NAME = "Gauge"
const INDICATOR_NAME = "GaugeIndicator"
const TRACK_NAME = "GaugeTrack"
const RANGE_NAME = "GaugeRange"
const VALUE_TEXT_NAME = "GaugeValueText"

const DEFAULT_MAX = 100
const DEFAULT_START_ANGLE = 0
const DEFAULT_END_ANGLE = 360
const DEFAULT_SEGMENTS = 60
const DEFAULT_GAP = 4
const DEFAULT_THICKNESS = 2
const DEFAULT_DURATION = 700

type GaugeState = "indeterminate" | "complete" | "loading"

type DivProps = React.ComponentProps<"div">

interface GaugeContextValue {
  value: number | null
  valueText: string | undefined
  animatedValueText: string | undefined
  max: number
  min: number
  state: GaugeState
  radius: number
  thickness: number
  size: number
  center: number
  percentage: number | null
  animatedPercentage: number | null
  startAngle: number
  endAngle: number
  segments: number
  gap: number
  tickInnerRadius: number
  tickOuterRadius: number
  valueTextId: string
  labelId: string
}

const GaugeContext = React.createContext<GaugeContextValue | null>(null)

function useGaugeContext(consumerName: string) {
  const context = React.useContext(GaugeContext)

  if (!context) {
    throw new Error(
      `\`${consumerName}\` must be used within \`${GAUGE_NAME}\``
    )
  }

  return context
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function getDefaultValueText(value: number, min: number, max: number) {
  const percentage = max === min ? 100 : ((value - min) / (max - min)) * 100

  return `${Math.round(percentage)}%`
}

function getEffectiveSegments(
  radius: number,
  thickness: number,
  gap: number,
  requestedSegments: number
) {
  const circumference = 2 * Math.PI * radius
  const minimumSpacing = Math.max(1, thickness + gap)

  const maxPossibleSegments = Math.max(
    1,
    Math.floor(circumference / minimumSpacing)
  )

  return Math.min(requestedSegments, maxPossibleSegments)
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  }
}

function useAnimatedNumber(target: number | null, duration: number) {
  const [current, setCurrent] = React.useState<number | null>(
    target === null ? null : 0
  )
  const currentRef = React.useRef(0)

  React.useEffect(() => {
    if (target === null) {
      currentRef.current = 0
      setCurrent(null)
      return
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    if (reduceMotion || duration <= 0) {
      currentRef.current = target
      setCurrent(target)
      return
    }

    const from = currentRef.current
    const start = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      const next = t === 1 ? target : from + (target - from) * eased

      currentRef.current = next
      setCurrent(next)

      if (t < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return current
}

interface GaugeProps extends DivProps {
  value?: number | null
  getValueText?: (value: number, min: number, max: number) => string
  min?: number
  max?: number
  size?: number
  thickness?: number
  gap?: number
  startAngle?: number
  endAngle?: number
  segments?: number
  tickInnerRadius?: number
  tickOuterRadius?: number
  duration?: number
}

function Gauge({
  value: valueProp = null,
  getValueText = getDefaultValueText,
  min: minProp = 0,
  max: maxProp = DEFAULT_MAX,
  size = 200,
  thickness = DEFAULT_THICKNESS,
  gap = DEFAULT_GAP,
  startAngle = DEFAULT_START_ANGLE,
  endAngle = DEFAULT_END_ANGLE,
  segments = DEFAULT_SEGMENTS,
  tickInnerRadius,
  tickOuterRadius,
  duration = DEFAULT_DURATION,
  className,
  children,
  ...rootProps
}: GaugeProps) {
  const min = isFiniteNumber(minProp) ? minProp : 0

  const max =
    isFiniteNumber(maxProp) && maxProp > min
      ? maxProp
      : Math.max(DEFAULT_MAX, min + 1)

  const safeSize = isFiniteNumber(size) && size > 0 ? size : 200

  const safeThickness =
    isFiniteNumber(thickness) && thickness > 0
      ? thickness
      : DEFAULT_THICKNESS

  const safeGap =
    isFiniteNumber(gap) && gap >= 0 ? gap : DEFAULT_GAP

  const requestedSegments =
    Number.isInteger(segments) && segments > 0
      ? segments
      : DEFAULT_SEGMENTS

  const center = safeSize / 2
  const radius = Math.max(0, (safeSize - safeThickness) / 2)

  const effectiveSegments = getEffectiveSegments(
    radius,
    safeThickness,
    safeGap,
    requestedSegments
  )

  const validValue = isFiniteNumber(valueProp)
    ? Math.min(max, Math.max(min, valueProp))
    : null

  const percentage =
    validValue === null
      ? null
      : Math.max(0, Math.min(1, (validValue - min) / (max - min)))

  const animatedPercentage = useAnimatedNumber(percentage, duration)

  const valueText =
    validValue === null
      ? undefined
      : getValueText(validValue, min, max)

  // Text shown in the center while the ticks sweep (respects custom getValueText).
  // aria-valuetext still uses the real value.
  const animatedValueText =
    validValue === null || animatedPercentage === null
      ? valueText
      : getValueText(min + animatedPercentage * (max - min), min, max)

  const state: GaugeState =
    validValue === null
      ? "indeterminate"
      : validValue >= max
        ? "complete"
        : "loading"

  const labelId = React.useId()
  const valueTextId = React.useId()

  const contextValue = React.useMemo<GaugeContextValue>(
    () => ({
      value: validValue,
      valueText,
      animatedValueText,
      min,
      max,
      state,
      radius,
      thickness: safeThickness,
      size: safeSize,
      center,
      percentage,
      animatedPercentage,
      startAngle,
      endAngle,
      segments: effectiveSegments,
      gap: safeGap,
      tickInnerRadius: tickInnerRadius ?? Math.max(0, radius - 24),
      tickOuterRadius: tickOuterRadius ?? radius,
      valueTextId,
      labelId,
    }),
    [
      validValue,
      valueText,
      animatedValueText,
      min,
      max,
      state,
      radius,
      safeThickness,
      safeSize,
      center,
      percentage,
      animatedPercentage,
      startAngle,
      endAngle,
      effectiveSegments,
      safeGap,
      tickInnerRadius,
      tickOuterRadius,
      valueTextId,
      labelId,
    ]
  )

  return (
    <GaugeContext.Provider value={contextValue}>
      <div
        role="meter"
        aria-describedby={valueText ? valueTextId : undefined}
        aria-labelledby={labelId}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={validValue ?? undefined}
        aria-valuetext={valueText}
        data-state={state}
        data-value={validValue ?? undefined}
        data-max={max}
        data-min={min}
        data-percentage={percentage ?? undefined}
        {...rootProps}
        className={cn(
          "relative inline-flex w-fit flex-col items-center justify-center",
          className
        )}
      >
        {children}
      </div>
    </GaugeContext.Provider>
  )
}

function getTickAngles(
  startAngle: number,
  endAngle: number,
  segments: number
) {
  const step = (endAngle - startAngle) / segments

  return Array.from({ length: segments }, (_, index) => ({
    angle: startAngle + step * (index + 0.5),
  }))
}

function GaugeIndicator(props: React.ComponentProps<"svg">) {
  const { className, children, ...indicatorProps } = props

  const { size, state, value, max, min, percentage } =
    useGaugeContext(INDICATOR_NAME)

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      data-state={state}
      data-value={value ?? undefined}
      data-max={max}
      data-min={min}
      data-percentage={percentage ?? undefined}
      {...indicatorProps}
      className={cn("block overflow-visible", className)}
    >
      {children}
    </svg>
  )
}

function GaugeTrack(props: React.ComponentProps<"line">) {
  const { className, ...trackProps } = props

  const {
    center,
    thickness,
    segments,
    startAngle,
    endAngle,
    tickInnerRadius,
    tickOuterRadius,
    state,
  } = useGaugeContext(TRACK_NAME)

  return (
    <>
      {getTickAngles(startAngle, endAngle, segments).map((tick, index) => {
        const inner = polarToCartesian(
          center,
          center,
          tickInnerRadius,
          tick.angle
        )

        const outer = polarToCartesian(
          center,
          center,
          tickOuterRadius,
          tick.angle
        )

        return (
          <line
            key={index}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke="currentColor"
            strokeWidth={thickness}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            data-state={state}
            {...trackProps}
            className={cn("text-muted-foreground/20", className)}
          />
        )
      })}
    </>
  )
}

function GaugeRange(props: React.ComponentProps<"line">) {
  const { className, ...rangeProps } = props

  const {
    center,
    thickness,
    segments,
    startAngle,
    endAngle,
    tickInnerRadius,
    tickOuterRadius,
    percentage,
    animatedPercentage,
    state,
    value,
    max,
    min,
  } = useGaugeContext(RANGE_NAME)

  if (percentage === null || animatedPercentage === null) return null

  return (
    <>
      {getTickAngles(startAngle, endAngle, segments).map((tick, index) => {
        const isActive = animatedPercentage >= (index + 1) / segments

        if (!isActive) return null

        const inner = polarToCartesian(
          center,
          center,
          tickInnerRadius,
          tick.angle
        )

        const outer = polarToCartesian(
          center,
          center,
          tickOuterRadius,
          tick.angle
        )

        return (
          <line
            key={index}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke="currentColor"
            strokeWidth={thickness}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            data-state={state}
            data-value={value ?? undefined}
            data-max={max}
            data-min={min}
            data-percentage={percentage}
            {...rangeProps}
            className={cn("text-primary", className)}
          />
        )
      })}
    </>
  )
}

function GaugeValueText({
  className,
  children,
  ...props
}: DivProps) {
  const { valueTextId, state, animatedValueText } =
    useGaugeContext(VALUE_TEXT_NAME)

  return (
    <div
      id={valueTextId}
      data-state={state}
      {...props}
      className={cn(
        "absolute inset-0 flex items-center justify-center text-3xl font-medium",
        className
      )}
    >
      {children ?? animatedValueText}
    </div>
  )
}

function GaugeLabel({ className, ...props }: DivProps) {
  const { labelId } = useGaugeContext("GaugeLabel")

  return (
    <div
      id={labelId}
      {...props}
      className={cn(
        "text-sm font-medium text-muted-foreground",
        className
      )}
    />
  )
}

function GaugeCombined(props: GaugeProps) {
  return (
    <Gauge {...props}>
      <GaugeIndicator>
        <GaugeTrack />
        <GaugeRange />
      </GaugeIndicator>

      <GaugeValueText />
    </Gauge>
  )
}

export {
  Gauge,
  GaugeCombined,
  GaugeIndicator,
  GaugeLabel,
  GaugeRange,
  GaugeTrack,
  GaugeValueText,
  type GaugeProps,
}
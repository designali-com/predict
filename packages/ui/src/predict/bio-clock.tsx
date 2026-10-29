// @ts-nocheck
"use client"

import React from "react"
import { motion } from "framer-motion"

import { cn } from "@workspace/ui/lib/utils"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

export interface Segment {
  label: string
  color: string
  value?: number
}

export interface DomainSegment {
  label: string
  fullName: string
  color: string
  value: number
}

export interface SeverityRange {
  min: number
  max: number
  color: string
}

export interface SeverityScale {
  ranges: SeverityRange[]
  current: number
}

export interface ClockGaugeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  currentValue?: number
  yearsValue?: string
  segments?: Segment[]
  domains?: DomainSegment[]
  severity?: SeverityScale
  bioAge?: number
  yearsDiff?: string

  // Size
  size?: "sm" | "default" | "lg" | "xl" | number
}

/* =========================================================
   DEFAULT DATA
========================================================= */

const DEFAULT_DOMAINS: DomainSegment[] = [
  {
    label: "IFR",
    fullName: "Inflammation & Fibrosis Risk",
    color: "var(--color-status-moderate)",
    value: 10,
  },
  {
    label: "VAF",
    fullName: "Vascular Aging & Function",
    color: "var(--color-status-severe)",
    value: 45,
  },
  {
    label: "MHF",
    fullName: "Metabolic Health & Function",
    color: "var(--color-status-mild)",
    value: 30,
  },
  {
    label: "BMF",
    fullName: "Bone & Muscle Function",
    color: "var(--color-status-extreme)",
    value: 45,
  },
  {
    label: "PNF",
    fullName: "Physical & Neuromuscular Function",
    color: "var(--color-status-normal)",
    value: 90,
  },
  {
    label: "CMF",
    fullName: "Cognitive & Mental Function",
    color: "var(--color-status-moderate)",
    value: 55,
  },
  {
    label: "RFF",
    fullName: "Recovery & Functional Fitness",
    color: "var(--color-status-severe)",
    value: 40,
  },
]

const DEFAULT_SEVERITY: SeverityScale = {
  ranges: [
    {
      min: 0,
      max: 1,
      color: "var(--color-status-normal)",
    },
    {
      min: 1,
      max: 2,
      color: "var(--color-status-mild)",
    },
    {
      min: 2,
      max: 3,
      color: "var(--color-status-moderate)",
    },
    {
      min: 3,
      max: 4,
      color: "var(--color-status-severe)",
    },
    {
      min: 4,
      max: 5,
      color: "var(--color-status-extreme)",
    },
  ],
  current: 1.1,
}

/* =========================================================
   COMPONENT
========================================================= */

export const BioClock = React.forwardRef<
  HTMLDivElement,
  ClockGaugeProps
>(
  (
    {
      className,
      currentValue,
      yearsValue,
      segments,
      domains: explicitDomains,
      severity: explicitSeverity,
      bioAge = 60,
      yearsDiff: explicitYearsDiff,
      size = "default",
      ...props
    },
    ref
  ) => {
    /* =====================================================
       UNIQUE IDS
    ===================================================== */

    const uid = React.useId().replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    )

    const gradientId = `bio-clock-gradient-${uid}`

    /* =====================================================
       SIZE
    ===================================================== */

    const sizeMap = {
      sm: 320,
      default: 450,
      lg: 600,
      xl: 720,
    } as const

    const resolvedSize =
      typeof size === "number"
        ? size
        : sizeMap[size]

    /* =====================================================
       DOMAINS
    ===================================================== */

    const domains = React.useMemo<DomainSegment[]>(() => {
      if (explicitDomains) {
        return explicitDomains
      }

      if (segments) {
        return segments.map((seg, index) => ({
          label: seg.label,
          fullName: seg.label,
          color: seg.color,
          value:
            seg.value ??
            (index + 1) * 10,
        }))
      }

      return DEFAULT_DOMAINS
    }, [explicitDomains, segments])

    /* =====================================================
       SEVERITY
    ===================================================== */

    const severity = React.useMemo<SeverityScale>(() => {
      if (explicitSeverity) {
        return currentValue !== undefined
          ? {
            ...explicitSeverity,
            current: currentValue,
          }
          : explicitSeverity
      }

      return {
        ...DEFAULT_SEVERITY,
        current:
          currentValue ??
          DEFAULT_SEVERITY.current,
      }
    }, [
      explicitSeverity,
      currentValue,
    ])

    const displayYearsDiff =
      yearsValue ??
      explicitYearsDiff ??
      "+7 YEARS"

    /* =====================================================
       DIMENSIONS
    ===================================================== */

    const baseSize = 600
    const center = baseSize / 2

    const outerRadius = 190
    const innerRadius = 145
    const ageScaleRadius = 145

    /* =====================================================
       ANGLES
    ===================================================== */

    const outerStartAngle = -200
    const outerEndAngle = 20

    const innerStartAngle = -180
    const innerEndAngle = 2

    const ageStartAngle = 160
    const ageEndAngle = 20

    /* =====================================================
       COORDINATES
    ===================================================== */

    const getCoordinates = React.useCallback(
      (
        angle: number,
        radius: number
      ) => {
        const rad =
          (angle * Math.PI) / 180

        return {
          x:
            center +
            radius * Math.cos(rad),
          y:
            center +
            radius * Math.sin(rad),
        }
      },
      [center]
    )

    /* =====================================================
       RADIAL RAYS
    ===================================================== */

    const radialRays = React.useMemo(() => {
      return Array.from(
        { length: 40 },
        (_, i) => {
          const angle =
            (i * 360) / 40

          return {
            p1: getCoordinates(
              angle,
              84
            ),
            p2: getCoordinates(
              angle,
              111
            ),
          }
        }
      )
    }, [getCoordinates])

    /* =====================================================
       AGE DOTS
    ===================================================== */

    const ageDots = React.useMemo(() => {
      return Array.from(
        { length: 40 },
        (_, i) => {
          const pct = i / 40

          const angle =
            ageStartAngle +
            pct *
            (ageEndAngle -
              ageStartAngle)

          const pos =
            getCoordinates(
              angle,
              ageScaleRadius
            )

          const centerDist =
            1 -
            Math.abs(
              0.5 - pct
            ) *
            2

          return {
            x: pos.x,
            y: pos.y,
            radius:
              1.5 +
              centerDist * 1,
            opacity: centerDist,
          }
        }
      )
    }, [
      getCoordinates,
      ageScaleRadius,
    ])

    /* =====================================================
       DOMAIN ARC GEOMETRY
    ===================================================== */

    const domainArcData =
      React.useMemo(() => {
        const arc =
          (outerEndAngle -
            outerStartAngle) /
          Math.max(
            domains.length,
            1
          )

        return domains.map(
          (segment, index) => {
            const startAngle =
              outerStartAngle +
              index * arc +
              4

            const endAngle =
              outerStartAngle +
              (index + 1) * arc -
              4

            const start =
              getCoordinates(
                startAngle,
                outerRadius
              )

            const end =
              getCoordinates(
                endAngle,
                outerRadius
              )

            const labelPos =
              getCoordinates(
                (startAngle +
                  endAngle) /
                2,
                outerRadius + 35
              )

            return {
              segment,
              index,
              startAngle,
              endAngle,
              start,
              end,
              labelPos,
            }
          }
        )
      }, [
        domains,
        getCoordinates,
        outerRadius,
      ])

    /* =====================================================
       INDICATORS
    ===================================================== */

    const maxValIndex =
      React.useMemo(() => {
        if (!domains.length)
          return 0

        return domains.reduce(
          (
            max,
            current,
            index,
            array
          ) =>
            current.value >
              array[max].value
              ? index
              : max,
          0
        )
      }, [domains])

    const domainAngle =
      outerStartAngle +
      (maxValIndex + 0.5) *
      ((outerEndAngle -
        outerStartAngle) /
        Math.max(
          domains.length,
          1
        ))

    const totalMin =
      severity.ranges[0]?.min ??
      0

    const totalMax =
      severity.ranges[
        severity.ranges.length - 1
      ]?.max ?? 5

    const severityProgress =
      (severity.current -
        totalMin) /
      (totalMax - totalMin)

    const severityAngle =
      innerStartAngle +
      severityProgress *
      (innerEndAngle -
        innerStartAngle)

    const agePct =
      Math.min(
        Math.max(bioAge, 0),
        100
      ) / 100

    const currentAgeAngle =
      ageStartAngle +
      agePct *
      (ageEndAngle -
        ageStartAngle)

    /* =====================================================
       NEEDLE TARGETS
    ===================================================== */

    const domainTarget =
      getCoordinates(
        domainAngle,
        outerRadius - 10
      )

    const domainStart =
      getCoordinates(
        outerStartAngle,
        outerRadius - 10
      )

    const severityTarget =
      getCoordinates(
        severityAngle,
        innerRadius
      )

    const severityStart =
      getCoordinates(
        innerStartAngle,
        innerRadius
      )

    const ageTarget =
      getCoordinates(
        currentAgeAngle,
        ageScaleRadius - 32
      )

    const ageStart =
      getCoordinates(
        ageStartAngle,
        ageScaleRadius - 32
      )

    /* =====================================================
       SEVERITY GRADIENT
    ===================================================== */

    const severityGradientStops =
      React.useMemo(() => {
        return severity.ranges.map(
          (range, index) => {
            const minPct =
              ((range.min -
                totalMin) /
                (totalMax -
                  totalMin)) *
              100

            const maxPct =
              ((range.max -
                totalMin) /
                (totalMax -
                  totalMin)) *
              100

            const midPct =
              (minPct + maxPct) /
              2

            return {
              index,
              offset: `${midPct}%`,
              color: range.color,
            }
          }
        )
      }, [
        severity.ranges,
        totalMin,
        totalMax,
      ])

    /* =====================================================
       AGE BADGE
    ===================================================== */

    const ageBadge =
      React.useMemo(() => {
        const badgeRadius =
          ageScaleRadius

        const badgeWidthAngle = 26

        const isFlipped =
          currentAgeAngle > 180 ||
          currentAgeAngle < -90

        const startA =
          currentAgeAngle -
          badgeWidthAngle / 2

        const endA =
          currentAgeAngle +
          badgeWidthAngle / 2

        const pStart =
          getCoordinates(
            startA,
            badgeRadius
          )

        const pEnd =
          getCoordinates(
            endA,
            badgeRadius
          )

        const shapeSweepFlag =
          isFlipped ? 0 : 1

        const textSweepFlag =
          shapeSweepFlag === 1
            ? 0
            : 1

        const shapePathId =
          `bio-clock-shape-${uid}-${Math.round(
            currentAgeAngle
          )}`

        const textPathId =
          `bio-clock-text-${uid}-${Math.round(
            currentAgeAngle
          )}`

        const shapePath = `
          M ${pStart.x} ${pStart.y}
          A ${badgeRadius} ${badgeRadius}
          0 0 ${shapeSweepFlag}
          ${pEnd.x} ${pEnd.y}
        `

        const textPath = `
          M ${pEnd.x} ${pEnd.y}
          A ${badgeRadius} ${badgeRadius}
          0 0 ${textSweepFlag}
          ${pStart.x} ${pStart.y}
        `

        return {
          shapePath,
          textPath,
          shapePathId,
          textPathId,
        }
      }, [
        currentAgeAngle,
        getCoordinates,
        ageScaleRadius,
        uid,
      ])

    /* =====================================================
       RENDER
    ===================================================== */

    return (
      <TooltipProvider delay={100}>
        <div
          ref={ref}
          className={cn(
            "relative flex shrink-0 items-center justify-center select-none",
            className
          )}
          style={{
            width: resolvedSize,
            height: resolvedSize,
          }}
          {...props}
        >
          <svg
            viewBox="0 30 600 500"
            width={resolvedSize}
            height={resolvedSize}
            className="block h-full w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient
                id={gradientId}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                {severityGradientStops.map(
                  (stop) => (
                    <stop
                      key={stop.index}
                      offset={
                        stop.offset
                      }
                      stopColor={
                        stop.color
                      }
                    />
                  )
                )}
              </linearGradient>
            </defs>

            {/* =================================================
                RADIAL RAYS
            ================================================= */}

            {radialRays.map(
              (
                { p1, p2 },
                index
              ) => (
                <line
                  key={index}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  className="stroke-foreground/20"
                  strokeWidth="1"
                />
              )
            )}

            {/* =================================================
                SEVERITY ARC
            ================================================= */}

            {(() => {
              const start =
                getCoordinates(
                  innerStartAngle,
                  innerRadius
                )

              const end =
                getCoordinates(
                  innerEndAngle,
                  innerRadius
                )

              return (
                <motion.path
                  d={`
                    M ${start.x} ${start.y}
                    A ${innerRadius} ${innerRadius}
                    0 0 1
                    ${end.x} ${end.y}
                  `}
                  fill="none"
                  filter={`url(#pathInsetShadow-${uid})`}
                  stroke={`url(#${gradientId})`}
                  strokeWidth="26"
                  strokeLinecap="round"
                  initial={{
                    pathLength: 0,
                  }}
                  animate={{
                    pathLength: 1,
                  }}
                  transition={{
                    duration: 0.35,
                    ease: "easeOut",
                  }}
                />
              )
            })()}

            {/* =================================================
                DOMAIN ARCS
            ================================================= */}

            {domainArcData.map(
              ({
                segment,
                index,
                start,
                end,
                labelPos,
              }) => (
                <Tooltip key={index}>
                  <TooltipTrigger
                    render={
                      <g
                        tabIndex={0}
                        className="cursor-pointer outline-none"
                      />
                    }
                  >
                    {/* Hit area */}
                    <path
                      d={`
                        M ${start.x} ${start.y}
                        A ${outerRadius} ${outerRadius}
                        0 0 1
                        ${end.x} ${end.y}
                      `}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="36"
                      pointerEvents="stroke"
                    />

                    {/* Visible arc */}
                    <defs>
                      <linearGradient
                        id={gradientId}
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="0%"
                      >
                        {severityGradientStops.map((stop) => (
                          <stop
                            key={stop.index}
                            offset={stop.offset}
                            stopColor={stop.color}
                          />
                        ))}
                      </linearGradient>

                      <filter
                        id={`pathInsetShadow-${uid}`}
                        x="-250"
                        y="-250"
                        width="1100"
                        height="1100"
                        filterUnits="userSpaceOnUse"
                        primitiveUnits="userSpaceOnUse"
                      >
                        <feGaussianBlur
                          in="SourceAlpha"
                          stdDeviation="3"
                          result="blur"
                        />
                        <feOffset
                          in="blur"
                          dx="0"
                          dy="1"
                          result="offset"
                        />
                        <feComposite
                          in="SourceAlpha"
                          in2="offset"
                          operator="out"
                          result="shadow"
                        />
                        <feFlood
                          floodColor="#ffffff"
                          floodOpacity="0.3"
                          result="color"
                        />
                        <feComposite
                          in="color"
                          in2="shadow"
                          operator="in"
                          result="highlight"
                        />
                        <feMerge>
                          <feMergeNode in="SourceGraphic" />
                          <feMergeNode in="highlight" />
                        </feMerge>
                      </filter>
                    </defs>
                    <motion.path
                      d={`
                         M ${start.x} ${start.y}
                         A ${outerRadius} ${outerRadius}
                         0 0 1 ${end.x} ${end.y} `}
                      fill="none"
                      filter={`url(#pathInsetShadow-${uid})`}
                      stroke={segment.color}
                      strokeWidth="24"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{
                        duration: 0.25,
                        delay: index * 0.02,
                        ease: "easeOut",
                      }}
                    />


                    <text
                      x={labelPos.x}
                      y={labelPos.y}
                      className="fill-foreground text-sm font-medium"
                      textAnchor="middle"
                    >
                      {
                        segment.label
                      }
                    </text>
                  </TooltipTrigger>

                  <TooltipContent>
                    <span>
                      {
                        segment.fullName
                      }
                    </span>

                    <span className="ml-2 font-bold">
                      {
                        segment.value
                      }
                    </span>
                  </TooltipContent>
                </Tooltip>
              )
            )}

            {/* =================================================
                AGE SCALE
            ================================================= */}

            <g>
              {ageDots.map(
                (
                  dot,
                  index
                ) => (
                  <circle
                    key={index}
                    cx={dot.x}
                    cy={dot.y}
                    r={dot.radius}
                    className="fill-foreground"
                    fillOpacity={
                      dot.opacity
                    }
                  />
                )
              )}

              <text
                x={
                  getCoordinates(
                    ageStartAngle +
                    5,
                    ageScaleRadius
                  ).x
                }
                y={
                  getCoordinates(
                    ageStartAngle +
                    5,
                    ageScaleRadius +
                    10
                  ).y
                }
                className="fill-muted-foreground text-[11px]"
                textAnchor="middle"
              >
                0
              </text>

              <text
                x={
                  getCoordinates(
                    ageEndAngle +
                    5,
                    ageScaleRadius +
                    10
                  ).x
                }
                y={
                  getCoordinates(
                    ageEndAngle -
                    5,
                    ageScaleRadius +
                    10
                  ).y
                }
                className="fill-muted-foreground text-[11px]"
                textAnchor="middle"
              >
                100
              </text>
            </g>

            {/* =================================================
                DOMAIN NEEDLE
            ================================================= */}

            <motion.line
              x1={center}
              y1={center}
              initial={{
                x2: domainStart.x,
                y2: domainStart.y,
              }}
              animate={{
                x2:
                  domainTarget.x - 5,
                y2:
                  domainTarget.y + 10,
              }}
              transition={{
                type: "spring",
                stiffness: 180,
                damping: 20,
                mass: 0.25,
              }}
              className="stroke-foreground"
              strokeWidth="3"
              strokeDasharray="7,7"
              strokeLinecap="round"
            />

            {/* =================================================
                SEVERITY NEEDLE
            ================================================= */}

            <g>
              <motion.line
                x1={center}
                y1={center}
                initial={{
                  x2: severityStart.x,
                  y2: severityStart.y,
                }}
                animate={{
                  x2: severityTarget.x,
                  y2: severityTarget.y,
                }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 22,
                  mass: 0.2,
                }}
                className="stroke-foreground"
                strokeWidth="3"
                strokeLinecap="round"
              />

              <motion.g
                initial={{
                  opacity: 0,
                }}
                animate={{
                  opacity: 1,
                }}
                transition={{
                  duration: 0.15,
                }}
              >
                <circle
                  filter={`url(#pathInsetShadow-${uid})`}
                  cx={
                    severityTarget.x
                  }
                  cy={
                    severityTarget.y
                  }
                  r="24"
                  fill="var(--background)"
                  className="stroke-foreground/20"
                />

                <text
                  x={
                    severityTarget.x
                  }
                  y={
                    severityTarget.y +
                    5
                  }
                  className="fill-foreground text-md font-semibold"
                  textAnchor="middle"
                >
                  {
                    severity.current
                  }
                </text>
              </motion.g>
            </g>

            {/* =================================================
                BIO AGE NEEDLE
            ================================================= */}

            <g>
              <motion.line
                x1={center}
                y1={center}
                initial={{
                  x2: ageStart.x,
                  y2: ageStart.y,
                }}
                animate={{
                  x2:
                    ageTarget.x +
                    10,
                  y2:
                    ageTarget.y +
                    10,
                }}
                transition={{
                  type: "spring",
                  stiffness: 220,
                  damping: 24,
                  mass: 0.2,
                }}
                className="stroke-foreground"
                strokeWidth="8"
                strokeLinecap="round"
              />

              {/* Age badge */}
              <motion.g
                initial={{
                  opacity: 0,
                  scale: 0.9,
                }}
                animate={{
                  opacity: 1,
                  scale: 1,
                }}
                transition={{
                  duration: 0.18,
                  ease: "easeOut",
                }}
              >
                <path
                  d={
                    ageBadge.shapePath
                  }
                  fill="none"
                  stroke="var(--background)"
                  strokeWidth="28"
                  strokeLinecap="round"
                />

                <path
                  d={
                    ageBadge.shapePath
                  }
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="22"
                  strokeLinecap="round"
                />

                <path
                  id={
                    ageBadge.textPathId
                  }
                  d={
                    ageBadge.textPath
                  }
                  fill="none"
                  stroke="none"
                />

                <text
                  className="fill-foreground text-xs font-extrabold tracking-tight"
                  dominantBaseline="central"
                >
                  <textPath
                    href={`#${ageBadge.textPathId}`}
                    startOffset="50%"
                    textAnchor="middle"
                  >
                    {displayYearsDiff}{" "}
                    ({bioAge})
                  </textPath>
                </text>
              </motion.g>
            </g>

            {/* =================================================
                CENTER PIVOT
            ================================================= */}

            <circle
              cx={center}
              cy={center}
              r="10"
              className="fill-foreground"
            />

            <circle
              cx={center}
              cy={center}
              r="4"
              className="fill-background"
            />
          </svg>
        </div>
      </TooltipProvider>
    )
  }
)

BioClock.displayName = "BioClock"
//@ts-nocheck
"use client"

import React from "react"
import { motion } from "framer-motion"
import { cn } from "@workspace/ui/lib/utils"

/* =========================================================
   TYPES & INTERFACES
========================================================= */

export interface Segment {
    label: string
    color: string
    value?: number
}

export interface DomainSegment {
    label: string
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

export interface ClockGaugeProps extends React.HTMLAttributes<HTMLDivElement> {
    currentValue?: number
    yearsValue?: string
    segments?: Segment[]
    domains?: DomainSegment[]
    severity?: SeverityScale
    bioAge?: number
    yearsDiff?: string
}

/* =========================================================
   DEFAULT FALLBACK DATA (USING STATUS CSS VARIABLES)
========================================================= */

const DEFAULT_DOMAINS: DomainSegment[] = [
    { label: "IFR", color: "var(--color-status-moderate)", value: 10 },
    { label: "VAF", color: "var(--color-status-severe)", value: 45 },
    { label: "MHF", color: "var(--color-status-mild)", value: 30 },
    { label: "BMF", color: "var(--color-status-extreme)", value: 45 },
    { label: "PNF", color: "var(--color-status-normal)", value: 90 },
    { label: "CMF", color: "var(--color-status-moderate)", value: 55 },
    { label: "RFF", color: "var(--color-status-severe)", value: 40 },
]

const DEFAULT_SEVERITY: SeverityScale = {
    ranges: [
        { min: 0, max: 1, color: "var(--color-status-normal)" },
        { min: 1, max: 2, color: "var(--color-status-mild)" },
        { min: 2, max: 3, color: "var(--color-status-moderate)" },
        { min: 3, max: 4, color: "var(--color-status-severe)" },
        { min: 4, max: 5, color: "var(--color-status-extreme)" },
    ],
    current: 1.1,
}

/* =========================================================
   COMPONENT
========================================================= */

export const BioClock = React.forwardRef<HTMLDivElement, ClockGaugeProps>(
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
            ...props
        },
        ref
    ) => {
        // 1. DOMAINS COMPUTATION
        const domains: DomainSegment[] = React.useMemo(() => {
            if (explicitDomains) return explicitDomains
            if (segments) {
                return segments.map((seg, index) => ({
                    label: seg.label,
                    color: seg.color,
                    value: seg.value ?? (index + 1) * 10,
                }))
            }
            return DEFAULT_DOMAINS
        }, [explicitDomains, segments])

        // 2. SEVERITY COMPUTATION
        const severity: SeverityScale = React.useMemo(() => {
            if (explicitSeverity) {
                return currentValue !== undefined
                    ? { ...explicitSeverity, current: currentValue }
                    : explicitSeverity
            }
            return {
                ...DEFAULT_SEVERITY,
                current: currentValue ?? DEFAULT_SEVERITY.current,
            }
        }, [explicitSeverity, currentValue])

        // The gap from the owner's real age, e.g. "+10 Years". No default:
        // the old hard-coded "+7 YEARS" put a number on the dial that
        // belonged to nobody.
        const displayYearsDiff = yearsValue ?? explicitYearsDiff ?? ""

        const badgeLabel = displayYearsDiff
            ? `${displayYearsDiff} (${bioAge.toFixed(2)})`
            : bioAge.toFixed(2)

        // DIMENSIONS & RADII
        const baseSize = 600
        const center = baseSize / 2
        const outerRadius = 220
        const innerRadius = 170

        // ANGLES
        const outerStartAngle = -200
        const outerEndAngle = 20
        const innerStartAngle = -180
        const innerEndAngle = 2

        // AGE SCALE ANGLES
        const ageScaleRadius = 170
        const ageStartAngle = 160
        const ageEndAngle = 20

        const getCoordinates = (angle: number, r: number) => {
            const rad = (angle * Math.PI) / 180
            return {
                x: center + r * Math.cos(rad),
                y: center + r * Math.sin(rad),
            }
        }

        // INDICATOR ANGLE COMPUTATIONS
        const maxValIndex = domains.reduce(//@ts-ignore
            (max, curr, idx, arr) => (curr.value > arr[max].value ? idx : max),
            0
        )
        const domainAngle =
            outerStartAngle +
            (maxValIndex + 0.5) *
            ((outerEndAngle - outerStartAngle) / Math.max(domains.length, 1))
         
        const totalMin = severity.ranges[0].min
         
        const totalMax = severity.ranges[severity.ranges.length - 1].max
        const severityAngle =
            innerStartAngle +
            ((severity.current - totalMin) / (totalMax - totalMin)) *
            (innerEndAngle - innerStartAngle)


        const agePct = Math.min(Math.max(bioAge, 0), 100) / 100
        const currentAgeAngle =
            ageStartAngle + agePct * (ageEndAngle - ageStartAngle)

        // Target End Points for Needles Animation
        const domainTarget = getCoordinates(domainAngle, outerRadius - 10)
        const domainStart = getCoordinates(outerStartAngle, outerRadius - 10)

        const severityTarget = getCoordinates(severityAngle, innerRadius)
        const severityStart = getCoordinates(innerStartAngle, innerRadius)

        const ageTarget = getCoordinates(currentAgeAngle, ageScaleRadius - 28)
        const ageStart = getCoordinates(ageStartAngle, ageScaleRadius - 28)

        return (
            <div
                ref={ref}
                className={cn(
                    "relative flex w-full h-full items-center justify-center overflow-hidden select-none",
                    className
                )}
                {...props}
            >
                <svg
                    viewBox={`0 0 ${baseSize} ${baseSize}`}
                    className="h-auto w-full transition-all duration-300"
                    preserveAspectRatio="xMidYMid meet"
                >
                    <defs>
                        {/* SVG Inset Shadow Filter Definition */}
                        <filter
                            id="pathInsetShadow"
                            x="-30%"
                            y="-30%"
                            width="160%"
                            height="160%"
                            filterUnits="userSpaceOnUse"
                        >
                            {/* Top Highlight (rgba(255,255,255,0.4), dy=6, blur=3) */}
                            <feOffset dx="0" dy="6" />
                            <feGaussianBlur stdDeviation="2" result="offset-blur-top" />
                            <feComposite
                                operator="out"
                                in="SourceGraphic"
                                in2="offset-blur-top"
                                result="inverse-top"
                            />
                            <feFlood floodColor="#ffffff" floodOpacity="0.3" result="color-top" />
                            <feComposite
                                operator="in"
                                in="color-top"
                                in2="inverse-top"
                                result="shadow-top"
                            />

                            {/* Bottom Subtle Highlight (rgba(255,255,255,0.2), dy=-2, blur=4) */}
                            <feOffset dx="0" dy="-2" />
                            <feGaussianBlur stdDeviation="4" result="offset-blur-bottom" />
                            <feComposite
                                operator="out"
                                in="SourceGraphic"
                                in2="offset-blur-bottom"
                                result="inverse-bottom"
                            />
                            <feFlood
                                floodColor="-var(-foreground)"
                                floodOpacity="0.3"
                                result="color-bottom"
                            />
                            <feComposite
                                operator="in"
                                in="color-bottom"
                                in2="inverse-bottom"
                                result="shadow-bottom"
                            />

                            {/* Merge Original Graphic and Inset Shadows */}
                            <feMerge>
                                <feMergeNode in="SourceGraphic" />
                                <feMergeNode in="shadow-top" />
                                <feMergeNode in="shadow-bottom" />
                            </feMerge>
                        </filter>
                    </defs>

                    {/* Background Radial Rays */}
                    {Array.from({ length: 80 }).map((_, i) => {
                        const angle = (i * 360) / 80
                        const p1 = getCoordinates(angle, 100)
                        const p2 = getCoordinates(angle, 130)
                        return (
                            <motion.line
                                key={i}
                                x1={p1.x}
                                y1={p1.y}
                                x2={p2.x}
                                y2={p2.y}
                                className="stroke-foreground/20"
                                strokeWidth="1"
                                filter="url(#pathInsetShadow)"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.3, delay: i * 0.003 }}
                            />
                        )
                    })}

                    {/* TOP INNER ARC (Severity Scale) */}
                    {/* 1. In SVG <defs>, add the dynamic multi-stop gradient */}
                    <linearGradient id="severityGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        {severity.ranges.map((range, idx) => {
                            const minPct = ((range.min - totalMin) / (totalMax - totalMin)) * 100
                            const maxPct = ((range.max - totalMin) / (totalMax - totalMin)) * 100
                            const midPct = (minPct + maxPct) / 2

                            return <stop key={idx} offset={`${midPct}%`} stopColor={range.color} />
                        })}
                    </linearGradient>

                    {/* 2. Render as a single mixed gradient path */}
                    {(() => {
                        const start = getCoordinates(innerStartAngle, innerRadius)
                        const end = getCoordinates(innerEndAngle, innerRadius)

                        return (
                            <motion.path
                                d={`M ${start.x} ${start.y} A ${innerRadius} ${innerRadius} 0 0 1 ${end.x} ${end.y}`}
                                fill="none"
                                stroke="url(#severityGradient)"
                                strokeWidth="22"
                                strokeLinecap="round"
                                className="opacity-95 transition-all duration-300"
                                filter="url(#pathInsetShadow)"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                            />
                        )
                    })()}

                    {/* TOP OUTER ARC (Domains) */}
                    {domains.map((seg, i) => {
                        const arc = (outerEndAngle - outerStartAngle) / domains.length
                        const sAngle = outerStartAngle + i * arc + 4
                        const eAngle = outerStartAngle + (i + 1) * arc - 4
                        const start = getCoordinates(sAngle, outerRadius)
                        const end = getCoordinates(eAngle, outerRadius)
                        const labelPos = getCoordinates(
                            (sAngle + eAngle) / 2,
                            outerRadius + 40
                        )
                        return (
                            <g key={i}>
                                <motion.path
                                    d={`M ${start.x} ${start.y} A ${outerRadius} ${outerRadius} 0 0 1 ${end.x} ${end.y}`}
                                    fill="none"
                                    stroke={seg.color}
                                    strokeWidth="20"
                                    strokeLinecap="round"
                                    filter="url(#pathInsetShadow)"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{
                                        duration: 0.6,
                                        delay: 0.2 + i * 0.05,
                                        ease: "easeOut",
                                    }}
                                />
                                <motion.text
                                    x={labelPos.x}
                                    y={labelPos.y}
                                    className="fill-foreground font-medium text-sm"
                                    textAnchor="middle"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.4, delay: 0.4 + i * 0.04 }}
                                >
                                    {seg.label}
                                </motion.text>
                            </g>
                        )
                    })}

                    {/* BOTTOM AGE SCALE */}
                    <g>
                        {Array.from({ length: 60 }).map((_, i) => {
                            const pct = i / 60
                            const angle = ageStartAngle + pct * (ageEndAngle - ageStartAngle)
                            const pos = getCoordinates(angle, ageScaleRadius)
                            const centerDist = 1 - Math.abs(0.5 - pct) * 2

                            return (
                                <motion.circle
                                    key={i}
                                    cx={pos.x}
                                    cy={pos.y}
                                    r={2 + centerDist * 1}
                                    className="fill-foreground"
                                    fillOpacity={0 + centerDist * 1}
                                    filter="url(#pathInsetShadow)"
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ duration: 0.3, delay: 0.2 + i * 0.005 }}
                                />
                            )
                        })}
                        <text
                            x={getCoordinates(ageStartAngle + 0, ageScaleRadius + 22).x}
                            y={getCoordinates(ageStartAngle + 5, ageScaleRadius + 22).y}
                            className="fill-muted-foreground text-[11px]"
                            textAnchor="middle"
                        >
                            0
                        </text>
                        <text
                            x={getCoordinates(ageEndAngle - 0, ageScaleRadius + 22).x}
                            y={getCoordinates(ageEndAngle - 5, ageScaleRadius + 22).y}
                            className="fill-muted-foreground text-[11px]"
                            textAnchor="middle"
                        >
                            100
                        </text>
                    </g>

                    {/* SECOND HAND (Domain Indicator) */}
                    <motion.line
                        x1={center}
                        y1={center}
                        initial={{ x2: domainStart.x, y2: domainStart.y }}
                        animate={{ x2: domainTarget.x, y2: domainTarget.y }}
                        transition={{
                            type: "spring",
                            stiffness: 45,
                            damping: 12,
                            delay: 0.4,
                        }}
                        className="stroke-foreground"
                        strokeWidth="4"
                        strokeDasharray="8,8"
                        strokeLinecap="round"
                    />

                    {/* MINUTE HAND (Severity Bubble) */}
                    <g>
                        <motion.line
                            x1={center}
                            y1={center}
                            initial={{ x2: severityStart.x, y2: severityStart.y }}
                            animate={{ x2: severityTarget.x, y2: severityTarget.y }}
                            transition={{
                                type: "spring",
                                stiffness: 50,
                                damping: 14,
                                delay: 0.5,
                            }}
                            className="stroke-foreground"
                            strokeWidth="4"
                            strokeLinecap="round"
                        />
                        <motion.g
                            initial={{
                                transform: `translate(${severityStart.x - severityTarget.x}px, ${severityStart.y - severityTarget.y}px)`,
                                opacity: 0,
                            }}
                            animate={{
                                transform: `translate(0px, 0px)`,
                                opacity: 1,
                            }}
                            transition={{
                                type: "spring",
                                stiffness: 50,
                                damping: 14,
                                delay: 0.5,
                            }}
                        >
                            <circle
                                cx={severityTarget.x}
                                cy={severityTarget.y}
                                r="26"
                                fill="var(--background)"
                                fillOpacity="0.9"
                                className="stroke-foreground/20"
                                filter="url(#pathInsetShadow)"
                            />
                            <text
                                x={severityTarget.x}
                                y={severityTarget.y + 5}
                                className="font-semibold fill-foreground text-md"
                                textAnchor="middle"
                            >
                                {/* A composite score carries a dozen decimals
                                    out of the maths. Two is all that fits in
                                    the bubble and all that means anything. */}
                                {severity.current.toFixed(2)}
                            </text>
                        </motion.g>
                    </g>

                    {/* HOUR HAND (Bio-Age Needle) */}
                    <g>
                        <motion.line
                            x1={center}
                            y1={center}
                            initial={{ x2: ageStart.x, y2: ageStart.y }}
                            animate={{ x2: ageTarget.x, y2: ageTarget.y }}
                            transition={{
                                type: "spring",
                                stiffness: 40,
                                damping: 12,
                                delay: 0.6,
                            }}
                            className="stroke-foreground"
                            strokeWidth="10"
                            strokeLinecap="round"
                        />
                        {(() => {
                            const badgeRadius = ageScaleRadius
                            // Sized to the text, not fixed at 26°. A fixed arc
                            // silently truncated anything longer than "+7
                            // YEARS" — the label read "…S (57.15277923350173)".
                            const badgeWidthAngle = Math.max(
                                26,
                                (badgeLabel.length * 8 * 180) /
                                    (Math.PI * badgeRadius)
                            )

                            const startA =
                                currentAgeAngle - badgeWidthAngle / 2

                            const endA =
                                currentAgeAngle + badgeWidthAngle / 2

                            const pStart = getCoordinates(startA, badgeRadius)
                            const pEnd = getCoordinates(endA, badgeRadius)

                            // The age hand only ever sweeps the lower half
                            // (160° → 20°), so one pair of flags is right for
                            // every age. The shape runs start → end with the
                            // angle increasing, which in SVG is sweep 1 — the
                            // arc on the clock's own circle. Flipping it past
                            // 90° (as this used to, for any biological age
                            // under 50) picks the other circle through the
                            // same two points, and the chip bulged the wrong
                            // way with its text curved upside down.
                            const shapeSweepFlag = 1

                            // Text runs end → start (left to right on screen),
                            // on the same circle: sweep 0. Upright, readable.
                            const textSweepFlag = 0

                            const shapePathId = `badgeShapePath-${currentAgeAngle.toFixed(0)}`
                            const textPathId = `badgeTextPath-${currentAgeAngle.toFixed(0)}`

                            const shapePath = `
                                 M ${pStart.x} ${pStart.y}
                                 A ${badgeRadius} ${badgeRadius}
                                 0 0 ${shapeSweepFlag}
                                 ${pEnd.x} ${pEnd.y}
    `

                            // 180° ROTATED TEXT PATH (Coordinates reversed from pEnd to pStart)
                            const textPath = `
                                M ${pEnd.x} ${pEnd.y}
                                A ${badgeRadius} ${badgeRadius}
                                0 0 ${textSweepFlag}
                                ${pStart.x} ${pStart.y}
    `

                            return (
                                <motion.g
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.4, delay: 0.8 }}
                                >
                                    {/* Background shape */}
                                    <path
                                        id={shapePathId}
                                        d={shapePath}
                                        fill="none"
                                        stroke="var(--background)"
                                        strokeWidth="30"
                                        strokeLinecap="round"
                                        className="stroke-background"
                                    />

                                    {/* Border */}
                                    <path
                                        d={shapePath}
                                        fill="none"
                                        stroke="var(--border)"
                                        strokeWidth="24"
                                        strokeLinecap="round"
                                    />

                                    {/* Hidden text path — 180 deg reversed direction */}
                                    <path
                                        id={textPathId}
                                        d={textPath}
                                        fill="none"
                                        stroke="none"
                                    />

                                    {/* Text follows reversed path */}
                                    <text
                                        className="fill-foreground font-extrabold text-xs tracking-tight"
                                        dominantBaseline="central"
                                    >
                                        <textPath
                                            href={`#${textPathId}`}
                                            startOffset="50%"
                                            textAnchor="middle"
                                        >
                                            {badgeLabel}
                                        </textPath>
                                    </text>
                                </motion.g>
                            )
                        })()}
                    </g>

                    {/* Center Pivot */}
                    <motion.circle
                        cx={center}
                        cy={center}
                        r="12"
                        className="fill-foreground"
                        filter="url(#pathInsetShadow)"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    />
                    <circle cx={center} cy={center} r="5" className="fill-background" />
                </svg>
            </div>
        )
    }
)

BioClock.displayName = "BioClock"
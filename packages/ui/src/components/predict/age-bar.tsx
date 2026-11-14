"use client"

import { motion } from "framer-motion"
import { Badge } from "@workspace/ui/components/badge"

export interface AgeBarProps {
  biologicalAge?: number
  chronologicalAge?: number
  healthScore?: number
  className?: string
}

function getBasePercentage(age: number): number {
  const clamped = Math.min(Math.max(age, 0), 100)

  if (clamped <= 20) {
    return (clamped / 20) * 15
  } else if (clamped <= 70) {
    return 15 + ((clamped - 20) / 50) * 70
  } else {
    return 85 + ((clamped - 70) / 30) * 15
  }
}

/**
 * There is no sensible default for somebody's age, so there isn't one: a
 * placeholder here would be indistinguishable from a real reading, which is
 * exactly the mistake worth ruling out. No ages, no bar.
 */
export function AgeBar({
  biologicalAge,
  chronologicalAge,
  className = "",
}: AgeBarProps) {
  if (biologicalAge == null || chronologicalAge == null) return null

  const rawBioPercent = getBasePercentage(biologicalAge)
  const rawChronoPercent = getBasePercentage(chronologicalAge)

  const MIN_GAP = 40
  const currentGap = Math.abs(rawChronoPercent - rawBioPercent)

  let bioPercent = rawBioPercent
  let chronoPercent = rawChronoPercent

  if (currentGap < MIN_GAP) {
    const extraNeeded = (MIN_GAP - currentGap) / 2

    if (biologicalAge <= chronologicalAge) {
      bioPercent = rawBioPercent - extraNeeded
      chronoPercent = rawChronoPercent + extraNeeded
    } else {
      bioPercent = rawBioPercent + extraNeeded
      chronoPercent = rawChronoPercent - extraNeeded
    }
  }

  // Keep both markers on the bar. Two ages close together near either end
  // (71 and 81, say) used to have one pushed to exactly 100% — centred there,
  // half the marker and its label hung off the end past "100". When the gap
  // pushes one past an edge, both move back together, so the gap holds.
  const EDGE_MIN = 4
  const EDGE_MAX = 92
  {
    const hi = Math.max(bioPercent, chronoPercent)
    if (hi > EDGE_MAX) {
      bioPercent -= hi - EDGE_MAX
      chronoPercent -= hi - EDGE_MAX
    }
    const lo = Math.min(bioPercent, chronoPercent)
    if (lo < EDGE_MIN) {
      bioPercent += EDGE_MIN - lo
      chronoPercent += EDGE_MIN - lo
    }
    bioPercent = Math.min(EDGE_MAX, Math.max(EDGE_MIN, bioPercent))
    chronoPercent = Math.min(EDGE_MAX, Math.max(EDGE_MIN, chronoPercent))
  }

  // Where a marker's label hangs: centred on the line, or — near an end — to
  // the inside of it, so "Chronological Age" never runs off the card.
  const anchor = (at: number) =>
    at >= 80
      ? "-translate-x-[calc(100%-3px)] items-end"
      : at <= 20
        ? "-translate-x-[3px] items-start"
        : "-translate-x-1/2 items-center"

  const startPercent = Math.min(bioPercent, chronoPercent)
  const endPercent = Math.max(bioPercent, chronoPercent)

  const rangeWidthPercent = endPercent - startPercent
  const rightWidthPercent = 100 - endPercent

  // --------------------------------
  // Automatic Aging Multiplier
  // --------------------------------

  /**
   * How far the body is from its owner's age, as a ratio.
   *
   * This is a ratio, not a rate, and the label says so. It used to read
   * "Aging 1.2x faster", which claims a speed — 1.2 years of ageing per year
   * lived. Nothing here measures that. A pace needs two panels taken at
   * different times, so that (bio₂ − bio₁) can be divided by the time that
   * actually passed between them; from a single panel all that can be said is
   * where the body stands today.
   *
   * Biological over chronological, not the other way round. Inverted, a body
   * ten years older than its owner read "0.8x" — the reassuring direction for
   * the worse of the two outcomes.
   */
  const ageRatio = chronologicalAge > 0 ? biologicalAge / chronologicalAge : 1

  const formattedRatio = ageRatio.toFixed(1)

  const ageDifference = Math.round(Math.abs(chronologicalAge - biologicalAge))

  // Below a rounded year apart the two are the same age as far as anybody
  // reading this is concerned, and "1.0×" would be a distinction without a
  // difference.
  const isLevel = ageDifference === 0
  const isOlder = !isLevel && biologicalAge > chronologicalAge

  const badgeText = isLevel ? (
    <>Body the same as your age</>
  ) : (
    <>
      Body{" "}
      <span className={isOlder ? "font-bold text-destructive" : "font-bold text-emerald-500"}>
        {formattedRatio}×
      </span>{" "}
      your age
    </>
  )

  // On a phone the two labels and the badge do not fit on the bar itself —
  // they sat on top of each other, and a marker near either end pushed its
  // label off the card. So there the numbers go in a row above the bar, in
  // the same left-to-right order as the markers below them, and the bar
  // carries only the markers.
  const ages = [
    { key: "chrono", value: chronologicalAge, label: "Chronological Age", at: chronoPercent },
    { key: "bio", value: biologicalAge, label: "Biological Age", at: bioPercent },
  ].sort((a, b) => a.at - b.at)

  return (
    <div className={`flex w-full flex-col gap-2 pt-2 sm:flex-row sm:items-stretch sm:gap-3 sm:pt-6 ${className}`}>
      <motion.div
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:hidden"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {ages.map((age, i) => (
          <div
            key={age.key}
            className={`flex flex-col ${i === 0 ? "col-start-1 items-start text-left" : "col-start-3 items-end text-right"}`}
            style={{ gridRow: 1 }}
          >
            <span className="text-2xl leading-none font-bold tabular-nums">{Math.round(age.value)}</span>
            <span className="mt-1 text-[11px] leading-tight text-muted-foreground">{age.label}</span>
          </div>
        ))}
        <Badge className="col-start-2 row-start-1 text-[11px]">{badgeText}</Badge>
      </motion.div>

      {/* flex-none on a phone: in the column there, flex-1's zero basis
          would win over the height and fold the bar to nothing. */}
      <div className="relative h-24 min-w-0 flex-none select-none sm:h-32 sm:flex-1">

        {/* -------------------------------- */}
        {/* Scale Range Boundary Markers */}
        {/* -------------------------------- */}

        <div className="absolute bottom-12 left-0 font-mono text-xs text-muted-foreground">
          0
        </div>

        <div className="absolute right-1 bottom-12 font-mono text-xs text-muted-foreground">
          100
        </div>

        {/* -------------------------------- */}
        {/* Dynamic Range Highlight */}
        {/* -------------------------------- */}

        <motion.div
          className="absolute bottom-10 h-3 bg-primary/20"
          initial={{
            left: `${startPercent}%`,
            width: 0,
            opacity: 0,
          }}
          animate={{
            left: `${startPercent}%`,
            width: `${rangeWidthPercent}%`,
            opacity: 1,
          }}
          transition={{
            duration: 1,
            ease: [0.22, 1, 0.36, 1],
          }}
        />

        {/* -------------------------------- */}
        {/* Aging Multiplier Badge */}
        {/* -------------------------------- */}

        <motion.div
          className="absolute bottom-14 z-30 hidden -translate-x-1/2 flex-col items-center whitespace-nowrap sm:flex"
          initial={{
            left: `${startPercent + rangeWidthPercent / 2}%`,
            opacity: 0,
            y: 10,
            scale: 0.8,
          }}
          animate={{
            left: `${startPercent + rangeWidthPercent / 2}%`,
            opacity: 1,
            y: 0,
            scale: 1,
          }}
          transition={{
            duration: 0.7,
            delay: 1,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <Badge>{badgeText}</Badge>
        </motion.div>

        {/* -------------------------------- */}
        {/* Biological Age Indicator */}
        {/* -------------------------------- */}

        <motion.div
          className={`absolute top-2 z-20 flex flex-col ${anchor(bioPercent)}`}
          initial={{
            left: "0%",
            opacity: 0,
            scale: 0.8,
          }}
          animate={{
            left: `${bioPercent}%`,
            opacity: 1,
            scale: 1,
          }}
          transition={{
            duration: 1.2,
            delay: 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className="hidden flex-col items-center whitespace-nowrap sm:flex">
            <span className="text-xl leading-tight font-bold">
              {Math.round(biologicalAge)}
            </span>

            <span className="text-xs font-medium text-muted-foreground">
              Biological Age
            </span>
          </div>

          <motion.div
            className="mt-1 h-20 w-1.5 rounded-full bg-primary shadow-xs"
            initial={{
              scaleY: 0,
              transformOrigin: "top",
            }}
            animate={{
              scaleY: 1,
            }}
            transition={{
              duration: 0.7,
              delay: 0.7,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        </motion.div>

        {/* -------------------------------- */}
        {/* Chronological Age Indicator */}
        {/* -------------------------------- */}

        <motion.div
          className={`absolute top-2 z-20 flex flex-col ${anchor(chronoPercent)}`}
          initial={{
            left: "100%",
            opacity: 0,
            scale: 0.8,
          }}
          animate={{
            left: `${chronoPercent}%`,
            opacity: 1,
            scale: 1,
          }}
          transition={{
            duration: 1.2,
            delay: 0.35,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className="hidden flex-col items-center whitespace-nowrap sm:flex">
            <span className="text-xl leading-tight font-bold">
              {Math.round(chronologicalAge)}
            </span>

            <span className="text-xs text-muted-foreground">
              Chronological Age
            </span>
          </div>

          <motion.div
            className="mt-1 h-20 w-1.5 rounded-full bg-primary"
            initial={{
              scaleY: 0,
              transformOrigin: "top",
            }}
            animate={{
              scaleY: 1,
            }}
            transition={{
              duration: 0.7,
              delay: 0.85,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        </motion.div>

        {/* -------------------------------- */}
        {/* TICK SCALE AREA */}
        {/* -------------------------------- */}

        <div className="absolute right-0 bottom-0 left-0 flex h-10 overflow-hidden border-t border-border/40">

          {/* Left muted area */}

          <motion.div
            className="h-full border-r border-border/50 opacity-40"
            initial={{
              width: 0,
            }}
            animate={{
              width: `${startPercent}%`,
            }}
            transition={{
              duration: 1,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              backgroundImage:
                "repeating-linear-gradient(to right, currentColor 0px, currentColor 1px, transparent 1px, transparent 6px)",
            }}
          />

          {/* Active range */}

          <motion.div
            className="relative flex h-full items-center justify-between border-r border-primary/50 px-1"
            initial={{
              width: 0,
            }}
            animate={{
              width: `${rangeWidthPercent}%`,
            }}
            transition={{
              duration: 1,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {Array.from({
              length: Math.max(1, ageDifference),
            }).map((_, index) => (
              <motion.div
                key={index}
                className="-mx-1.5 h-full w-[2px] shrink-0 bg-foreground/70"
                initial={{
                  opacity: 0,
                  scaleY: 0,
                }}
                animate={{
                  opacity: 1,
                  scaleY: 1,
                }}
                transition={{
                  duration: 0.25,
                  delay: 0.5 + index * 0.02,
                }}
              />
            ))}
          </motion.div>

          {/* Right muted area */}

          <motion.div
            className="h-full opacity-40"
            initial={{
              width: 0,
            }}
            animate={{
              width: `${rightWidthPercent}%`,
            }}
            transition={{
              duration: 1,
              delay: 0.25,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              backgroundImage:
                "repeating-linear-gradient(to right, currentColor 0px, currentColor 1px, transparent 1px, transparent 6px)",
            }}
          />
        </div>
      </div>
    </div>
  )
}
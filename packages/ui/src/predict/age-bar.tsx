"use client"

import { motion } from "framer-motion"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

export interface AgeBarProps {
  biologicalAge?: number
  chronologicalAge?: number
  className?: string
}

function getAgePositions(
  biologicalAge: number,
  chronologicalAge: number,
) {
  const CENTER = 50

  // Minimum distance from center
  const MIN_OFFSET = 30

  // Maximum distance from center
  const MAX_OFFSET = 35

  // Controls how much age difference affects spacing
  const OFFSET_MULTIPLIER = 2

  const ageDifference = Math.abs(
    biologicalAge - chronologicalAge,
  )

  // Always maintain minimum spacing.
  // Increase spacing based on age difference.
  const offset = Math.min(
    Math.max(
      ageDifference * OFFSET_MULTIPLIER,
      MIN_OFFSET,
    ),
    MAX_OFFSET,
  )

  let bioPercent = CENTER
  let chronoPercent = CENTER

  if (biologicalAge > chronologicalAge) {
    // Biological on RIGHT
    // Chronological on LEFT
    bioPercent = CENTER + offset
    chronoPercent = CENTER - offset
  } else if (biologicalAge < chronologicalAge) {
    // Biological on LEFT
    // Chronological on RIGHT
    bioPercent = CENTER - offset
    chronoPercent = CENTER + offset
  } else {
    // Same age
    // Keep them separated equally
    bioPercent = CENTER + MIN_OFFSET
    chronoPercent = CENTER - MIN_OFFSET
  }

  return {
    bioPercent,
    chronoPercent,
  }
}

export function AgeBar({
  biologicalAge = 48,
  chronologicalAge = 38,
  className = "",
}: AgeBarProps) {
  const { bioPercent, chronoPercent } =
    getAgePositions(
      biologicalAge,
      chronologicalAge,
    )

  const startPercent = Math.min(
    bioPercent,
    chronoPercent,
  )

  const endPercent = Math.max(
    bioPercent,
    chronoPercent,
  )

  const rangeWidthPercent =
    endPercent - startPercent

  const rangeCenter =
    startPercent + rangeWidthPercent / 2

  const isFaster =
    biologicalAge > chronologicalAge

  const isSlower =
    biologicalAge < chronologicalAge

  // Always the older age over the younger, so the badge reads
  // "1.3x faster" or "1.3x slower" rather than "0.8x faster".
  const agingMultiplier =
    Math.min(biologicalAge, chronologicalAge) > 0
      ? Math.max(biologicalAge, chronologicalAge) /
        Math.min(biologicalAge, chronologicalAge)
      : 1

  const formattedMultiplier =
    agingMultiplier.toFixed(1)

  const ageDifference = Math.abs(
    chronologicalAge - biologicalAge,
  )

  return (
    <div
      className={cn("flex w-full items-stretch gap-3 pt-6", className)}
    >
      <div className="relative h-32 min-w-0 flex-1 select-none">

        {/* Scale */}

        <div className="absolute bottom-12 left-0 font-mono text-xs text-muted-foreground">
          0
        </div>

        <div className="absolute right-1 bottom-12 font-mono text-xs text-muted-foreground">
          100
        </div>

        {/* Range */}

        <motion.div
          className="absolute bottom-10 h-2 bg-primary/20"
          initial={{
            left: "50%",
            width: 0,
            opacity: 0,
          }}
          animate={{
            left: `${startPercent}%`,
            width: `${rangeWidthPercent}%`,
            opacity: 1,
          }}
          transition={{
            duration: 0.8,
            ease: [0.22, 1, 0.36, 1],
          }}
        />

        {/* Aging Badge */}

        <motion.div
          className="absolute bottom-13 z-30 flex -translate-x-1/2 flex-col items-center whitespace-nowrap"
          initial={{
            left: "50%",
            opacity: 0,
            y: 8,
            scale: 0.9,
          }}
          animate={{
            left: `${rangeCenter}%`,
            opacity: 1,
            y: 0,
            scale: 1,
          }}
          transition={{
            duration: 0.6,
            delay: 0.5,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <Badge variant={"outline"}>
            {isFaster || isSlower ? (
              <>
                Aging{" "}
                <span
                  className={
                    isFaster
                      ? "font-bold text-destructive"
                      : "font-bold text-status-normal"
                  }
                >
                  {formattedMultiplier}x
                </span>{" "}
                {isFaster ? "faster" : "slower"}
              </>
            ) : (
              "Aging on pace"
            )}
          </Badge>
        </motion.div>

        {/* Biological Age */}

        <motion.div
          className="absolute top-2 z-20 flex -translate-x-1/2 flex-col items-center"
          initial={{
            left: "50%",
            opacity: 0,
            scale: 0.85,
          }}
          animate={{
            left: `${bioPercent}%`,
            opacity: 1,
            scale: 1,
          }}
          transition={{
            duration: 0.9,
            delay: 0.15,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className="flex flex-col items-center whitespace-nowrap">
            <span className="text-xl leading-tight font-bold">
              {biologicalAge}
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
              duration: 0.55,
              delay: 0.55,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        </motion.div>

        {/* Chronological Age */}

        <motion.div
          className="absolute top-2 z-20 flex -translate-x-1/2 flex-col items-center"
          initial={{
            left: "50%",
            opacity: 0,
            scale: 0.85,
          }}
          animate={{
            left: `${chronoPercent}%`,
            opacity: 1,
            scale: 1,
          }}
          transition={{
            duration: 0.9,
            delay: 0.25,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className="flex flex-col items-center whitespace-nowrap">
            <span className="text-xl leading-tight font-bold">
              {chronologicalAge}
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
              duration: 0.55,
              delay: 0.7,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        </motion.div>

        {/* Tick Scale */}

        <div className="absolute right-0 bottom-0 left-0 flex h-10 overflow-hidden border-t border-border/40">

          {/* Left */}

          <motion.div
            className="h-full border-r border-border/50 opacity-40"
            initial={{ width: "50%" }}
            animate={{
              width: `${startPercent}%`,
            }}
            transition={{
              duration: 0.8,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              backgroundImage:
                "repeating-linear-gradient(to right, currentColor 0px, currentColor 1px, transparent 1px, transparent 6px)",
            }}
          />

          {/* Active */}

          <motion.div
            className="relative flex h-full items-center justify-between border-r border-primary/50 px-1"
            initial={{ width: 0 }}
            animate={{
              width: `${rangeWidthPercent}%`,
            }}
            transition={{
              duration: 0.8,
              delay: 0.1,
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
                  duration: 0.2,
                  delay: 0.4 + index * 0.015,
                }}
              />
            ))}
          </motion.div>

          {/* Right */}

          <motion.div
            className="h-full opacity-40"
            initial={{ width: "50%" }}
            animate={{
              width: `${100 - endPercent}%`,
            }}
            transition={{
              duration: 0.8,
              delay: 0.15,
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
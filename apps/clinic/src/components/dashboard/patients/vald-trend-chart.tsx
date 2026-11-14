"use client"

import { useState } from "react"

export interface TrendPoint {
  date: string
  left: number | null
  right: number | null
}

/**
 * Okabe-Ito blue and orange.
 *
 * Chosen because this pair separates under every common form of colour
 * blindness, which a red/green pair does not — and left-versus-right is
 * precisely the comparison a clinician must not misread. Identity is never
 * carried by colour alone here: each side also has its own marker shape and a
 * label at the end of its line.
 */
const LEFT_COLOR = "#0072B2"
const RIGHT_COLOR = "#E69F00"

const W = 760
const H = 260
const PAD = { top: 18, right: 54, bottom: 30, left: 46 }

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min]
  const raw = (max - min) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(6)))
  return ticks
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

/**
 * One measure over time, left against right.
 *
 * A single set of axes for both sides, deliberately: two scales would make a
 * weaker limb look equal to a stronger one, which is the whole thing this chart
 * exists to show.
 */
export function ValdTrendChart({
  points,
  unit,
  label,
  decimals = 1,
}: {
  points: TrendPoint[]
  unit: string
  label: string
  decimals?: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  const values = points.flatMap((p) => [p.left, p.right]).filter((v): v is number => v != null)
  if (points.length === 0 || values.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-black/50 dark:text-white/35">
        No {label.toLowerCase()} recorded for this movement.
      </p>
    )
  }

  const lo = Math.min(...values)
  const hi = Math.max(...values)
  // A flat series must not collapse onto the axis.
  const pad = hi === lo ? Math.max(Math.abs(hi) * 0.1, 1) : (hi - lo) * 0.15
  // Floors at 0 for force, but a joint short of straight reads below 0° (knee
  // extension) — clamping there pushed those points off the chart.
  const yMin = lo >= 0 ? Math.max(0, lo - pad) : lo - pad
  const yMax = hi + pad

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const x = (i: number) =>
    PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH

  const ticks = niceTicks(yMin, yMax)

  function pathFor(pick: (p: TrendPoint) => number | null): string {
    let d = ""
    let pen = false
    points.forEach((p, i) => {
      const v = pick(p)
      if (v == null) {
        // A gap rather than a straight line across a test that did not measure
        // this side: joining them would invent a reading.
        pen = false
        return
      }
      d += `${pen ? "L" : "M"}${x(i)},${y(v)} `
      pen = true
    })
    return d.trim()
  }

  const active = hover != null ? points[hover] : null

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <svg width="14" height="10" aria-hidden>
            <line x1="0" y1="5" x2="14" y2="5" stroke={LEFT_COLOR} strokeWidth="2" />
            <circle cx="7" cy="5" r="3.5" fill={LEFT_COLOR} />
          </svg>
          <span className="text-black/70 dark:text-white/60">Left</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="14" height="10" aria-hidden>
            <line
              x1="0"
              y1="5"
              x2="14"
              y2="5"
              stroke={RIGHT_COLOR}
              strokeWidth="2"
              strokeDasharray="4 2.5"
            />
            <rect x="3.5" y="1.5" width="7" height="7" fill={RIGHT_COLOR} />
          </svg>
          <span className="text-black/70 dark:text-white/60">Right</span>
        </span>
        <span className="text-black/45 dark:text-white/30">
          {label} ({unit})
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[520px]"
          style={{ height: H }}
          role="img"
          aria-label={`${label} over time, left and right`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            const px = ((e.clientX - box.left) / box.width) * W
            let best = 0
            let bestGap = Infinity
            points.forEach((_, i) => {
              const gap = Math.abs(x(i) - px)
              if (gap < bestGap) {
                bestGap = gap
                best = i
              }
            })
            setHover(best)
          }}
        >
          {/* Grid stays recessive: it orients the eye, it is not the data. */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="currentColor"
                strokeWidth="1"
                className="text-black/10 dark:text-white/10"
              />
              <text
                x={PAD.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-current text-[10px] text-black/45 dark:text-white/30"
              >
                {t.toFixed(t % 1 === 0 ? 0 : decimals)}
              </text>
            </g>
          ))}

          {points.map((p, i) => (
            <text
              key={`${p.date}-${i}`}
              x={x(i)}
              y={H - 10}
              textAnchor="middle"
              className="fill-current text-[10px] text-black/45 dark:text-white/30"
            >
              {/* Every label would collide on a long history. */}
              {points.length <= 8 || i % Math.ceil(points.length / 8) === 0 ? shortDate(p.date) : ""}
            </text>
          ))}

          {active && (
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="currentColor"
              strokeWidth="1"
              className="text-black/25 dark:text-white/25"
            />
          )}

          {/* The gap between the sides, shaded. It is the thing being judged,
              and a shaded band reads faster than two lines that have to be
              compared point by point. Drawn only where both sides are known,
              so it never implies a measurement nobody took. */}
          {(() => {
            const known = points
              .map((p, i) => ({ p, i }))
              .filter(({ p }) => p.left != null && p.right != null)
            if (known.length < 2) return null
            const top = known.map(({ p, i }) => `${x(i)},${y(p.left!)}`).join(" L")
            const back = [...known]
              .reverse()
              .map(({ p, i }) => `${x(i)},${y(p.right!)}`)
              .join(" L")
            return (
              <path
                d={`M${top} L${back} Z`}
                fill="currentColor"
                className="text-black/[0.07] dark:text-white/[0.07]"
              />
            )
          })()}

          <path d={pathFor((p) => p.left)} fill="none" stroke={LEFT_COLOR} strokeWidth="2" />
          {/* Dashed as well as coloured, so the two sides stay apart on a
              grayscale screen or a printed screenshot. */}
          <path
            d={pathFor((p) => p.right)}
            fill="none"
            stroke={RIGHT_COLOR}
            strokeWidth="2"
            strokeDasharray="6 4"
          />

          {points.map((p, i) =>
            p.left == null ? null : (
              <circle
                key={`l${i}`}
                cx={x(i)}
                cy={y(p.left)}
                r={hover === i ? 5.5 : 4}
                fill={LEFT_COLOR}
                stroke="var(--vald-surface, #fff)"
                strokeWidth="2"
              />
            ),
          )}
          {points.map((p, i) =>
            p.right == null ? null : (
              <rect
                key={`r${i}`}
                x={x(i) - (hover === i ? 5 : 4)}
                y={y(p.right) - (hover === i ? 5 : 4)}
                width={hover === i ? 10 : 8}
                height={hover === i ? 10 : 8}
                fill={RIGHT_COLOR}
                stroke="var(--vald-surface, #fff)"
                strokeWidth="2"
              />
            ),
          )}

          {/* Direct labels at the end, so the reader never has to travel to a
              legend to know which line is which. */}
          {(() => {
            const lastLeft = [...points].reverse().find((p) => p.left != null)
            const lastRight = [...points].reverse().find((p) => p.right != null)
            return (
              <>
                {lastLeft && (
                  <text
                    x={W - PAD.right + 6}
                    y={y(lastLeft.left!)}
                    dominantBaseline="middle"
                    className="text-[10px] font-semibold"
                    fill={LEFT_COLOR}
                  >
                    L
                  </text>
                )}
                {lastRight && (
                  <text
                    x={W - PAD.right + 6}
                    y={y(lastRight.right!)}
                    dominantBaseline="middle"
                    className="text-[10px] font-semibold"
                    fill={RIGHT_COLOR}
                  >
                    R
                  </text>
                )}
              </>
            )
          })()}
        </svg>
      </div>

      <div className="mt-1 min-h-[20px] text-xs text-black/70 dark:text-white/60">
        {active ? (
          <>
            <span className="font-medium">{shortDate(active.date)}</span>
            <span className="ml-3" style={{ color: LEFT_COLOR }}>
              L {active.left != null ? active.left.toFixed(decimals) : "—"}
            </span>
            <span className="ml-3" style={{ color: RIGHT_COLOR }}>
              R {active.right != null ? active.right.toFixed(decimals) : "—"}
            </span>
            <span className="ml-2 text-black/45 dark:text-white/30">{unit}</span>
          </>
        ) : (
          <span className="text-black/40 dark:text-white/25">Hover a point for its values.</span>
        )}
      </div>
    </div>
  )
}

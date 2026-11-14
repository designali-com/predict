/**
 * The chart as it prints.
 *
 * Separate from the interactive one on purpose. This has no hover, fixed ink
 * colours that survive a printer's colour management, a filled band between the
 * two sides so the gap between limbs is visible in grayscale, and a value
 * printed at every point — on paper the patient cannot hover to read a number.
 */

const LEFT = "#0072B2"
const RIGHT = "#E69F00"

export interface ReportPoint {
  date: string
  left: number | null
  right: number | null
}

const W = 720
const H = 250
const PAD = { top: 22, right: 26, bottom: 40, left: 52 }

function ticksFor(min: number, max: number, count = 4): number[] {
  if (min === max) return [min]
  const raw = (max - min) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const out: number[] = []
  for (let v = Math.floor(min / step) * step; v <= max + step / 2; v += step) {
    out.push(Number(v.toFixed(6)))
  }
  return out
}

function dayLabel(value: string): string {
  // Clinic zone, pinned: an evening test must not label as the next day on a
  // machine set anywhere else.
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  })
}

export function ValdReportChart({
  points,
  unit,
  label,
  decimals = 1,
}: {
  points: ReportPoint[]
  unit: string
  label: string
  decimals?: number
}) {
  const values = points.flatMap((p) => [p.left, p.right]).filter((v): v is number => v != null)
  if (!points.length || !values.length) return null

  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = hi === lo ? Math.max(Math.abs(hi) * 0.12, 1) : (hi - lo) * 0.18
  // Floors at 0 for force; a joint short of straight reads below 0°.
  const yMin = lo >= 0 ? Math.max(0, lo - pad) : lo - pad
  const yMax = hi + pad

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH

  const line = (pick: (p: ReportPoint) => number | null) => {
    let d = ""
    let pen = false
    points.forEach((p, i) => {
      const v = pick(p)
      if (v == null) {
        pen = false
        return
      }
      d += `${pen ? "L" : "M"}${x(i)},${y(v)} `
      pen = true
    })
    return d.trim()
  }

  // The band between the sides. Drawn only where both are known, so it never
  // implies a measurement that was not taken.
  const bothKnown = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.left != null && p.right != null)
  const band =
    bothKnown.length > 1
      ? `${bothKnown.map(({ p, i }) => `${x(i)},${y(p.left!)}`).join(" L")} L${[...bothKnown]
          .reverse()
          .map(({ p, i }) => `${x(i)},${y(p.right!)}`)
          .join(" L")} Z`
      : null

  const everyNth = points.length <= 10 ? 1 : Math.ceil(points.length / 10)

  return (
    <div className="w-full">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <p className="text-[13px] font-semibold text-black">
          {label} <span className="font-normal text-black/55">({unit})</span>
        </p>
        <div className="flex items-center gap-4 text-[11px] text-black/70">
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="10" aria-hidden>
              <line x1="0" y1="5" x2="16" y2="5" stroke={LEFT} strokeWidth="2.5" />
              <circle cx="8" cy="5" r="3.5" fill={LEFT} />
            </svg>
            Left
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="10" aria-hidden>
              <line x1="0" y1="5" x2="16" y2="5" stroke={RIGHT} strokeWidth="2.5" strokeDasharray="5 3" />
              <rect x="4" y="1.5" width="7" height="7" fill={RIGHT} />
            </svg>
            Right
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} over time`}>
        {ticksFor(yMin, yMax).map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="#000"
              strokeOpacity="0.12"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="10"
              fill="#000"
              fillOpacity="0.55"
            >
              {t.toFixed(t % 1 === 0 ? 0 : decimals)}
            </text>
          </g>
        ))}

        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          stroke="#000"
          strokeOpacity="0.35"
        />

        {band && <path d={`M${band}`} fill="#000" fillOpacity="0.06" />}

        <path d={line((p) => p.left)} fill="none" stroke={LEFT} strokeWidth="2.5" />
        {/* Dashed as well as coloured, so a black-and-white printout still
            separates the two sides. */}
        <path
          d={line((p) => p.right)}
          fill="none"
          stroke={RIGHT}
          strokeWidth="2.5"
          strokeDasharray="6 4"
        />

        {points.map((p, i) => (
          <g key={p.date + i}>
            {p.left != null && (
              <>
                <circle cx={x(i)} cy={y(p.left)} r="4" fill={LEFT} stroke="#fff" strokeWidth="1.5" />
                <text
                  x={x(i)}
                  y={y(p.left) - 9}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="600"
                  fill={LEFT}
                >
                  {p.left.toFixed(decimals)}
                </text>
              </>
            )}
            {p.right != null && (
              <>
                <rect
                  x={x(i) - 4}
                  y={y(p.right) - 4}
                  width="8"
                  height="8"
                  fill={RIGHT}
                  stroke="#fff"
                  strokeWidth="1.5"
                />
                <text
                  x={x(i)}
                  y={y(p.right) + 16}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="600"
                  fill="#9a6b00"
                >
                  {p.right.toFixed(decimals)}
                </text>
              </>
            )}
            {i % everyNth === 0 && (
              <text
                x={x(i)}
                y={H - 14}
                textAnchor="middle"
                fontSize="10"
                fill="#000"
                fillOpacity="0.6"
              >
                {dayLabel(p.date)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

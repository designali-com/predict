"use client"

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

export interface Bucket {
  bucket: string
  count: number
}

/**
 * Counts over time, as bars.
 *
 * A bar chart because the job is magnitude across a set of discrete periods —
 * "how many that week" is a quantity you compare, not a continuous quantity
 * you interpolate between, which is what a line would imply about the gap
 * between two Mondays.
 *
 * One series, so one hue and no legend: the panel title already names what is
 * being counted, and a legend of one entry is a box with nothing to
 * distinguish. Colour carries magnitude here, not identity — every bar is the
 * same measure — so the only bar that differs is the most recent, which is
 * darkened because it is the one people look for.
 *
 * The dark step is chosen rather than derived. The brand primary sits at 2.86:1
 * against the dark card and fails the 3:1 floor there, so dark mode uses a
 * lighter step of the same hue (oklch 0.60 0.26 295.68) that clears it. Both
 * were checked with the palette validator rather than by eye.
 */
export function BucketChart({
  rows,
  headline,
  caption,
}: {
  rows: Bucket[]
  headline: number
  caption: string
}) {
  const newest = rows[rows.length - 1]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {headline.toLocaleString()}
        </span>
        <span className="text-sm text-black/60 dark:text-white/45">{caption}</span>
      </div>

      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-black/65 dark:text-white/40">
          Nothing to chart yet.
        </p>
      ) : (
        <>
          {/* The bars are decorative to a screen reader; the numbers behind
              them are not, so they are also readable as a list. */}
          <div className="sr-only">
            <table>
              <caption>{caption}</caption>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.bucket}>
                    <th scope="row">{r.bucket}</th>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div aria-hidden className="mt-4 min-h-[11rem] flex-1">
            <ResponsiveContainer width="100%" height="100%" minHeight={176}>
              <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
                {/* Recessive: the grid is a reading aid, not part of the data. */}
                <CartesianGrid
                  vertical={false}
                  stroke="currentColor"
                  className="text-black/10 dark:text-white/10"
                />
                <XAxis
                  dataKey="bucket"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval="preserveStartEnd"
                  className="text-black/60 dark:text-white/35"
                  tick={{ fontSize: 11, fill: "currentColor" }}
                />
                <YAxis
                  width={48}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  className="text-black/60 dark:text-white/35"
                  tick={{ fontSize: 11, fill: "currentColor" }}
                />
                <Tooltip
                  cursor={{ className: "fill-black/5 dark:fill-white/10" }}
                  content={<BucketTooltip />}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {rows.map((r) => (
                    <Cell
                      key={r.bucket}
                      className={
                        r === newest
                          ? "fill-[#8504fe] dark:fill-[#9347ff]"
                          : "fill-[#8504fe]/55 dark:fill-[#9347ff]/55"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Recharts' default tooltip is a white box with inline styles that ignores the
 * theme, so it gets replaced rather than restyled.
 */
function BucketTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value?: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-md border border-black/18 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/15 dark:bg-black">
      <p className="text-black/60 dark:text-white/45">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">
        {(payload[0]?.value ?? 0).toLocaleString()}
      </p>
    </div>
  )
}

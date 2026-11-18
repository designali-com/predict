"use client"

import { Button } from "@workspace/ui/components/button"

import { AlertTriangle, Plus, Trash2 } from "lucide-react"
import {
  RISK_LABELS,
  type RiskBand,
  type RiskLabel,
  validateRiskBands,
} from "@workspace/db/risk-bands"

/**
 * The risk bands for one index, added one at a time.
 *
 * This replaced three fixed inputs — Normal max, Moderate max, Severe max —
 * which decided for every index how many bands it had and what they were
 * called. Some want three, some five, some only Normal and Severe.
 *
 * Two rules do most of the work and both are enforced here rather than
 * explained in a hint:
 *
 *   Each band starts where the last one ended, so the minimum of every row
 *   after the first is not editable — it is the previous maximum. That makes
 *   a gap or an overlap unrepresentable instead of merely discouraged.
 *
 *   The last band has no maximum. A score can always be worse than the worst
 *   threshold anyone thought to set, so the top of the scale is open and the
 *   row says "and above" where its maximum would be.
 */
export function RiskBandsEditor({
  value,
  onChange,
}: {
  value: RiskBand[]
  onChange: (bands: RiskBand[]) => void
}) {
  const used = new Set(value.map((b) => b.label))
  const available = RISK_LABELS.filter((l) => !used.has(l))
  const error = validateRiskBands(value)

  function addBand(label: RiskLabel) {
    const previous = value[value.length - 1]
    // The new row takes over as the open-ended one; the row above it closes at
    // the value it was already showing as its own minimum plus nothing — so it
    // needs a real maximum, which starts as its minimum and is then typed in.
    const next: RiskBand[] = value.map((b, i) =>
      i === value.length - 1 ? { ...b, max: b.max ?? b.min } : b,
    )
    next.push({ label, min: previous ? (previous.max ?? previous.min) : 0, max: null })
    onChange(next)
  }

  function removeBand(index: number) {
    const next = value.filter((_, i) => i !== index)
    // Whatever is now last becomes the open-ended band, and the row after a
    // removal has to start where its new predecessor ends.
    onChange(
      next.map((b, i) => ({
        ...b,
        min: i === 0 ? b.min : (next[i - 1]!.max ?? next[i - 1]!.min),
        max: i === next.length - 1 ? null : b.max,
      })),
    )
  }

  function setMax(index: number, raw: string) {
    const max = raw === "" ? null : Number(raw)
    const next = value.map((b, i) => (i === index ? { ...b, max } : b))
    // Moving a boundary moves the start of the band above it: they are the
    // same number, and letting them drift apart is the gap this prevents.
    if (next[index + 1]) next[index + 1] = { ...next[index + 1]!, min: max ?? 0 }
    onChange(next)
  }

  function setFirstMin(raw: string) {
    if (!value.length) return
    onChange(value.map((b, i) => (i === 0 ? { ...b, min: raw === "" ? 0 : Number(raw) } : b)))
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-black/22 px-3 py-4 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/40">
          No bands yet. Add the first one below.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {value.map((band, i) => {
            const last = i === value.length - 1
            return (
              <div
                key={band.label}
                className="flex flex-wrap items-center gap-2 rounded-md border border-black/18 px-3 py-2 dark:border-white/10"
              >
                <span className="w-20 shrink-0 text-sm font-medium">{band.label}</span>

                <div className="flex flex-1 items-center gap-2 text-sm">
                  {i === 0 ? (
                    <input
                      type="number"
                      step="any"
                      value={band.min}
                      onChange={(e) => setFirstMin(e.target.value)}
                      aria-label={`${band.label} minimum`}
                      className="w-24 rounded-md border border-black/22 bg-white px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black dark:focus:border-white/40"
                    />
                  ) : (
                    <span
                      className="w-24 px-2 py-1.5 text-sm tabular-nums text-black/60 dark:text-white/40"
                      title="Starts where the band above ends"
                    >
                      {band.min}
                    </span>
                  )}

                  <span className="text-black/65 dark:text-white/30">to</span>

                  {last ? (
                    <span className="px-2 py-1.5 text-sm text-black/60 dark:text-white/40">
                      and above
                    </span>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      value={band.max ?? ""}
                      onChange={(e) => setMax(i, e.target.value)}
                      aria-label={`${band.label} maximum`}
                      className="w-24 rounded-md border border-black/22 bg-white px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black dark:focus:border-white/40"
                    />
                  )}
                </div>

                <Button variant="destructive" size="default" className="text-black/65 hover:text-red-600 dark:text-white/40"
 type="button"
 onClick={() => removeBand(i)}
 aria-label={`Remove ${band.label}`}

 >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
            Add
          </span>
          {available.map((label) => (
            <Button variant="outline" size="sm" className="hover:border-black/40 dark:hover:border-white/40"
 key={label}
 type="button"
 onClick={() => addBand(label)}

 >
              <Plus className="h-3 w-3" />
              {label}
            </Button>
          ))}
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-red-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

"use client"

import { Button } from "@workspace/ui/components/button"

import { Fragment } from "react"

import { PredictSpinner } from "@/src/components/predict-loader"

export interface PermissionRow {
  key: string
  panel: string
  area: string
  label: string
  route: string
}

const PANEL_LABEL: Record<string, string> = {
  clinic: "Clinic panel",
  operations: "Operations console",
}

/**
 * A left/right switch. Two states, because a page is either in someone's
 * sidebar or it is not — anything more expressive was a question nobody at a
 * clinic desk wants to answer.
 */
function Toggle({
  on,
  busy,
  disabled,
  onChange,
  label,
}: {
  on: boolean
  busy?: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <Button variant="ghost"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled || busy}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0 transition-colors disabled:opacity-40 ${
        on ? "bg-black dark:bg-white" : "bg-black/15 dark:bg-white/20"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform dark:bg-black ${
          on ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      >
        {busy && <PredictSpinner className="size-4" />}
      </span>
    </Button>
  )
}

/**
 * Every page in a panel's sidebar, with the route it opens.
 *
 * The route column is not decoration: "Patients" appears in three different
 * areas of the clinic panel and the label alone cannot tell them apart, so the
 * path is the only thing that says which one you are switching.
 */
export function PermissionTable({
  rows,
  isOn,
  busyKey,
  disabled,
  onToggle,
  columnLabel = "Access",
}: {
  rows: PermissionRow[]
  isOn: (key: string) => boolean
  busyKey?: string | null
  disabled?: boolean
  onToggle: (key: string, next: boolean) => void
  columnLabel?: string
}) {
  // Panel, then area — the same shape as the sidebar being configured, so the
  // list reads in the order someone will see it.
  const panels = new Map<string, Map<string, PermissionRow[]>>()
  for (const row of rows) {
    if (!panels.has(row.panel)) panels.set(row.panel, new Map())
    const areas = panels.get(row.panel)!
    if (!areas.has(row.area)) areas.set(row.area, [])
    areas.get(row.area)!.push(row)
  }

  return (
    <div className="space-y-4">
      {[...panels.entries()].map(([panel, areas]) => (
        <div key={panel}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/35">
            {PANEL_LABEL[panel] ?? panel}
          </p>
          <div className="overflow-hidden rounded-md border border-black/18 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="border-b border-black/18 bg-black/[0.02] text-left text-xs dark:border-white/10 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-3 py-2 font-medium">Page</th>
                  <th className="px-3 py-2 font-medium">Route</th>
                  <th className="w-20 px-3 py-2 text-right font-medium">{columnLabel}</th>
                </tr>
              </thead>
              <tbody>
                {[...areas.entries()].map(([area, items]) => (
                  <Fragment key={`${panel}-${area}`}>
                    <tr className="bg-black/[0.015] dark:bg-white/[0.015]">
                      <td
                        colSpan={3}
                        className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/35"
                      >
                        {area}
                      </td>
                    </tr>
                    {items.map((row) => (
                      <tr key={row.key} className="border-t border-black/12 dark:border-white/5">
                        <td className="px-3 py-2.5 font-medium">{row.label}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-black/60 dark:text-white/40">
                          {row.route}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Toggle
                            on={isOn(row.key)}
                            busy={busyKey === row.key}
                            disabled={disabled}
                            onChange={(next) => onToggle(row.key, next)}
                            label={`${row.label} (${row.route})`}
                          />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

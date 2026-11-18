"use client"

import { AlertTriangle } from "lucide-react"
import type { EmgMetrics, PhaseSpan } from "@/src/lib/emg/metrics"
import { isRestMarker } from "@/src/lib/emg/protocols"
import { RecordTable } from "./record-ui"

/** One colour per channel, the same on the scope, the chart and the tables. */
export const CHANNEL_COLOURS = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"]

export interface EmgEnvelope {
  /** Points per second. */
  hz: number
  /** RMS µV per channel. */
  channels: number[][]
}

export interface EmgMarker {
  t: number
  label: string
}

const fmt = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toFixed(d))

/**
 * The recording at a glance: each channel's RMS envelope in its own lane, the
 * active phases shaded, tap markers as lines, the DynaMo force under it when
 * one was used.
 */
export function EmgEnvelopeChart({
  envelope,
  phases,
  markers = [],
  force,
  muscles,
}: {
  envelope: EmgEnvelope
  phases: PhaseSpan[]
  markers?: EmgMarker[]
  force?: { t: number[]; newtons: number[] } | null
  muscles: string[]
}) {
  const lanes = envelope.channels.length + (force?.t.length ? 1 : 0)
  const points = envelope.channels[0]?.length ?? 0
  const seconds = points / (envelope.hz || 1)
  if (!points || seconds <= 0) return null
  const W = 1000
  const laneH = lanes > 4 ? 46 : 70
  const gap = lanes > 4 ? 6 : 10
  const H = lanes * laneH + (lanes - 1) * gap + 18
  const x = (t: number) => (t / seconds) * W

  const path = (values: number[], toX: (i: number) => number, top: number, max: number) =>
    values
      .map((v, i) => `${i ? "L" : "M"}${toX(i).toFixed(1)},${(top + laneH - (Math.min(v, max) / (max || 1)) * (laneH - 4)).toFixed(1)}`)
      .join("")

  const ticks: number[] = []
  const step = seconds > 120 ? 30 : seconds > 40 ? 10 : 5
  for (let t = 0; t <= seconds; t += step) ticks.push(t)

  return (
    <div className="flex flex-col gap-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: Math.min(lanes > 4 ? 440 : 360, H * 0.75) }}>
        {phases
          .filter((p) => !isRestMarker(p.marker))
          .map((p) => (
            <rect key={p.index} x={x(p.start)} y={0} width={Math.max(1, x(p.end) - x(p.start))} height={H - 18} className="fill-primary/[0.14]" />
          ))}
        {envelope.channels.map((values, ch) => {
          const top = ch * (laneH + gap)
          const max = Math.max(1, ...values) * 1.05
          return (
            <g key={ch}>
              <line x1={0} x2={W} y1={top + laneH} y2={top + laneH} className="stroke-black/25 dark:stroke-white/25" />
              <path d={path(values, (i) => (i / (envelope.hz || 1) / seconds) * W, top, max)} fill="none" stroke={CHANNEL_COLOURS[ch]} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
            </g>
          )
        })}
        {force?.t.length ? (
          (() => {
            const top = envelope.channels.length * (laneH + gap)
            const max = Math.max(1, ...force.newtons) * 1.05
            return (
              <g>
                <line x1={0} x2={W} y1={top + laneH} y2={top + laneH} className="stroke-black/25 dark:stroke-white/25" />
                <path d={path(force.newtons, (i) => x(force.t[i]!), top, max)} fill="none" className="stroke-violet-500" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
              </g>
            )
          })()
        ) : null}
        {markers.map((m, i) => (
          <line key={i} x1={x(m.t)} x2={x(m.t)} y1={0} y2={H - 18} className="stroke-rose-500" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        ))}
        {ticks.map((t) => (
          <text key={t} x={Math.min(W - 14, x(t))} y={H - 4} className="fill-black/60 text-[11px] dark:fill-white/55" textAnchor={t === 0 ? "start" : "middle"}>
            {t}s
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-black/70 dark:text-white/65">
        {muscles.map((m, ch) => (
          <span key={ch} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: CHANNEL_COLOURS[ch] }} />
            Ch {ch + 1} · {m}
          </span>
        ))}
        {force?.t.length ? (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-violet-500" />
            DynaMo force
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-primary/25" />
          Active phases
        </span>
        {markers.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-px bg-rose-500" />
            Markers
          </span>
        )}
      </div>
    </div>
  )
}

/** The numbers: per channel, per phase, together, and what to check. */
export function EmgMetricsView({ metrics }: { metrics: EmgMetrics }) {
  const active = metrics.phases.filter((p) => !isRestMarker(p.marker))
  return (
    <div className="flex flex-col gap-4">
      {metrics.quality.flags.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-500/60 bg-amber-500/[0.12] px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          {metrics.quality.flags.map((f, i) => (
            <li key={i} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      )}

      <RecordTable
        minWidth={640}
        head={["Muscle", "Rest µV", "Peak µV", "Active µV", "Peak / rest", "Onset", "MDF Hz", "Clipped"]}
        align={["left", "right", "right", "right", "right", "right", "right", "right"]}
        rows={metrics.channels.map((c) => [
          <span key="m" className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ background: CHANNEL_COLOURS[c.channel - 1] }} />
            {c.muscle}
          </span>,
          fmt(c.restUv, 1),
          fmt(c.peakUv, 0),
          fmt(c.activeUv, 0),
          c.signalToRest == null ? "—" : `×${fmt(c.signalToRest, 1)}`,
          c.onsetSec == null ? "—" : `${fmt(c.onsetSec, 2)} s`,
          fmt(c.mdfHz, 0),
          `${fmt(c.clipPercent, 1)}%`,
        ])}
      />

      {active.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-black/60 uppercase dark:text-white/55">Each phase, % of peak</p>
          <div className="max-h-64 overflow-y-auto">
            <RecordTable
              minWidth={460}
              head={["Phase", "Time", ...metrics.channels.map((c) => `Ch ${c.channel}`)]}
              align={["left", "right", ...metrics.channels.map(() => "right" as const)]}
              rows={active.map((p) => [
                <span key="p" className="capitalize">
                  {p.marker}
                  {p.side ? <span className="text-black/60 dark:text-white/60"> · {p.side}</span> : null}
                </span>,
                `${p.start.toFixed(0)}–${p.end.toFixed(0)} s`,
                ...p.channels.map((c) => `${c.percentPeak}%`),
              ])}
            />
          </div>
        </div>
      )}

      {metrics.coContraction.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-black/70 dark:text-white/65">Co-contraction</span>
          {metrics.coContraction.map((c) => (
            <span key={`${c.a}-${c.b}`} className="rounded-md bg-black/[0.07] px-2 py-1 tabular-nums dark:bg-white/15">
              Ch {c.a} + Ch {c.b}: <b>{c.percent}%</b>
            </span>
          ))}
        </div>
      )}

      <p className="text-[11px] text-black/60 dark:text-white/55">
        Amplitudes are nominal µV (the band is not calibrated per unit). Compare within a patient and the same placement; read these as flags for follow-up, not a diagnosis.
      </p>
    </div>
  )
}

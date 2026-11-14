"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * The therapy hours as a grid: days across, hours down, and in each cell how
 * many places are left. What the desk reads off when somebody calls.
 */

export interface SlotCell {
  hour: number
  booked: number
  free: number
  /** Therapists already with a patient in this hour. */
  busyTherapistIds?: string[]
}
export interface Therapist {
  id: string
  name: string
  gender: string | null
}
export interface DayColumn {
  day: string
  closed: boolean
  reason: string | null
  slots: SlotCell[]
}
export interface ScheduleSettings {
  openHour: number
  lastHour: number
  capacity: number
  closedWeekdays: number[]
}
export interface WeekData {
  from: string
  today: string
  settings: ScheduleSettings
  therapists?: Therapist[]
  columns: DayColumn[]
  holidays: { id: string; day: string; reason: string | null }[]
  canEdit: boolean
}

export function hourLabel(hour: number): string {
  const h = hour % 12 || 12
  return `${h} ${hour < 12 ? "AM" : "PM"}`
}

export function dayLabel(day: string, opts: { weekday?: boolean } = {}): string {
  const d = new Date(`${day}T00:00:00Z`)
  return d.toLocaleDateString("en-IN", {
    timeZone: "UTC",
    ...(opts.weekday === false ? {} : { weekday: "short" }),
    day: "numeric",
    month: "short",
  })
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The clinic's current hour (IST), for greying out hours already gone. */
export function clinicNowHour(): { day: string; hour: number } {
  const now = new Date(Date.now() + 330 * 60 * 1000)
  return { day: now.toISOString().slice(0, 10), hour: now.getUTCHours() }
}

/** A week of the grid from `from`, reloadable. */
export function useSlotWeek(from: string | null) {
  const [data, setData] = useState<WeekData | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/therapy-calendar?days=7${from ? `&from=${from}` : ""}`)
    const json = await res.json().catch(() => null)
    setData(res.ok ? json : null)
    setLoading(false)
  }, [from])
  useEffect(() => {
    void load()
  }, [load])
  return { data, loading, reload: load }
}

export function SlotGrid({
  columns,
  capacity,
  selected,
  onPick,
}: {
  columns: DayColumn[]
  capacity: number
  selected?: { day: string; hour: number } | null
  onPick: (day: string, hour: number) => void
}) {
  const now = clinicNowHour()
  const hours = columns[0]?.slots.map((s) => s.hour) ?? []
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full min-w-[560px] border-collapse text-xs">
        <thead>
          <tr className="bg-black/[0.03] dark:bg-white/[0.04]">
            <th className="w-16 px-2 py-2 text-left font-medium text-black/50 dark:text-white/40">Hour</th>
            {columns.map((c) => (
              <th
                key={c.day}
                className={`px-1 py-2 text-center font-semibold ${c.day === now.day ? "text-primary" : ""} ${c.closed ? "text-black/35 dark:text-white/30" : ""}`}
              >
                {dayLabel(c.day)}
                {c.closed && <span className="block text-[10px] font-normal">{c.reason ?? "Closed"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour} className="border-t border-black/[0.06] dark:border-white/[0.06]">
              <td className="px-2 py-1 font-medium tabular-nums text-black/60 dark:text-white/45">{hourLabel(hour)}</td>
              {columns.map((c) => {
                const cell = c.slots.find((s) => s.hour === hour)!
                const gone = c.day < now.day || (c.day === now.day && hour < now.hour)
                const isSel = selected?.day === c.day && selected?.hour === hour
                if (c.closed) {
                  return <td key={c.day} className="bg-black/[0.04] dark:bg-white/[0.05]" />
                }
                const tone =
                  cell.free === 0
                    ? "bg-red-500/10 text-red-700 dark:text-red-400"
                    : cell.free < capacity
                      ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                return (
                  <td key={c.day} className="p-0.5">
                    <button
                      type="button"
                      onClick={() => onPick(c.day, hour)}
                      className={`w-full rounded-md px-1 py-1.5 text-center tabular-nums transition ${
                        gone ? "opacity-40" : ""
                      } ${tone} ${isSel ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-black/20 dark:hover:ring-white/20"}`}
                      title={`${dayLabel(c.day)} ${hourLabel(hour)} — ${cell.booked} booked, ${cell.free} free`}
                    >
                      {cell.free === 0 ? "Full" : `${cell.free} free`}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

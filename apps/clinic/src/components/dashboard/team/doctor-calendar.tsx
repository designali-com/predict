"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react"

interface AppointmentItem {
  id: string
  scheduledAt: string
  status: string
  type: string
  patientName: string
}

interface DoctorAppointmentsData {
  doctor: { id: string; name: string }
  appointments: AppointmentItem[]
}

const TYPE_LABELS: Record<string, string> = {
  consultation: "Consultation",
  review: "Review",
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Visited",
  cancelled: "Cancelled",
  no_show: "Not Visited",
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function isSameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b)
}

function buildMonthGrid(monthAnchor: Date): Date[] {
  const year = monthAnchor.getFullYear()
  const month = monthAnchor.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7

  return Array.from({ length: totalCells }, (_, i) => new Date(year, month, 1 - firstWeekday + i))
}

interface DoctorCalendarProps {
  doctorId: string
}

export function DoctorCalendar({ doctorId }: DoctorCalendarProps) {
  const [data, setData] = useState<DoctorAppointmentsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [monthAnchor, setMonthAnchor] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())

  useEffect(() => {
    fetch(`/api/staff/doctors/${doctorId}/appointments`)
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true)
          return
        }
        setData(await res.json())
      })
      .finally(() => setLoading(false))
  }, [doctorId])

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, AppointmentItem[]>()
    for (const a of data?.appointments ?? []) {
      const key = dateKey(new Date(a.scheduledAt))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    for (const list of map.values()) {
      list.sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt))
    }
    return map
  }, [data])

  const grid = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor])
  const today = new Date()
  const selectedDayAppointments = appointmentsByDay.get(dateKey(selectedDate)) ?? []

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-black/65 dark:text-white/40">
        <ShieldCheck className="h-8 w-8 opacity-20" />
        <span className="text-sm">Doctor not found</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 text-black dark:text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{data.doctor.name}</h1>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Calendar */}
        <div className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" className="text-black hover:bg-black/5 dark:text-white dark:hover:bg-white/5"
 onClick={() => setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}

 >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="text-black hover:bg-black/5 dark:text-white dark:hover:bg-white/5"
 onClick={() => {
 setMonthAnchor(new Date())
 setSelectedDate(new Date())
 }}

 >
                Today
              </Button>
              <Button variant="outline" size="icon-sm" className="text-black hover:bg-black/5 dark:text-white dark:hover:bg-white/5"
 onClick={() => setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}

 >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((w) => (
              <div
                key={w}
                className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-black/65 dark:text-white/40"
              >
                {w}
              </div>
            ))}

            {grid.map((date) => {
              const inMonth = date.getMonth() === monthAnchor.getMonth()
              const dayAppts = appointmentsByDay.get(dateKey(date)) ?? []
              const isToday = isSameDay(date, today)
              const isSelected = isSameDay(date, selectedDate)

              return (
                <Button variant="ghost" size="default"
                  key={date.toISOString()}
                  onClick={() => setSelectedDate(date)}
                  className={`flex aspect-square flex-col items-center justify-center gap-1 border text-sm transition ${
 isSelected
 ?"border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
 : isToday
 ?"border-black/30 dark:border-white/30"
 :"border-transparent hover:bg-black/5 dark:hover:bg-white/5"
 } ${!inMonth ?"text-black/25 dark:text-white/25":""}`}
                >
                  <span>{date.getDate()}</span>
                  {dayAppts.length > 0 && (
                    <span
                      className={`h-1 w-1 rounded-full ${
                        isSelected ? "bg-white dark:bg-black" : "bg-black/60 dark:bg-white/60"
                      }`}
                    />
                  )}
                </Button>
              )
            })}
          </div>
        </div>

        {/* Selected day detail */}
        <div className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
            {selectedDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </p>

          {selectedDayAppointments.length === 0 ? (
            <p className="mt-3 text-sm text-black/65 dark:text-white/40">No appointments — free.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {selectedDayAppointments.map((a) => (
                <div key={a.id} className="rounded-md border border-black/18 p-3 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {new Date(a.scheduledAt).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-black/20 bg-black/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider dark:border-white/20 dark:bg-white/5">
                      {STATUS_LABELS[a.status] ?? a.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-black/70 dark:text-white/60">{a.patientName}</p>
                  <p className="text-xs text-black/65 dark:text-white/40">
                    {TYPE_LABELS[a.type] ?? a.type}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

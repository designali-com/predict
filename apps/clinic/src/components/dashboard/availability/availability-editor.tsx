"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Check, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react"

interface Window {
  id?: string
  dayOfWeek: number
  startTime: string
  endTime: string
  slotMinutes: number
  capacity: number
  isActive: boolean
}

interface TimeOff {
  id: string
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  reason: string | null
}

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
]

const SLOT_LENGTHS = [15, 20, 30, 45, 60]

const INPUT =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:border-ring focus:outline-none " +
  "disabled:cursor-default disabled:border-transparent disabled:bg-transparent disabled:opacity-100"

const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"

function today(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** How many appointments a window produces — the number that matters. */
function slotCount(w: Window): number {
  const [sh, sm] = w.startTime.split(":").map(Number)
  const [eh, em] = w.endTime.split(":").map(Number)
  const span = (eh ?? 0) * 60 + (em ?? 0) - ((sh ?? 0) * 60 + (sm ?? 0))
  if (span <= 0 || w.slotMinutes <= 0) return 0
  return Math.floor(span / w.slotMinutes) * Math.max(1, w.capacity)
}

/**
 * When I work, and when I am away.
 *
 * This is what the booking form reads. Until it existed the clinic panel asked
 * Cal.com instead, which answered from one event type with no schedule and no
 * hosts — so every doctor appeared to work Monday to Friday, nine to five,
 * whatever they actually did, and picking a doctor changed nothing.
 *
 * Hours are a weekly pattern, not a calendar: "Tuesdays, 9 to 1" holds until it
 * is changed. Leave is a separate dated list on top, so taking next Tuesday off
 * does not mean deleting Tuesdays and remembering to put them back.
 */
export function AvailabilityEditor({ doctorUserId }: { doctorUserId?: string }) {
  const [windows, setWindows] = useState<Window[]>([])
  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Hours are read-only once set. They are what the booking form reads, so a
  // stray click in a time box would quietly change what can be booked, with
  // no save and no warning. Editing is deliberate, or it does not happen.
  const [editing, setEditing] = useState(false)
  // What was last saved, so Cancel is a real undo rather than a reload.
  const [lastSaved, setLastSaved] = useState<Window[]>([])
  const [clash, setClash] = useState<number>(0)
  const [meetConnected, setMeetConnected] = useState<boolean | null>(null)
  const [redirectUri, setRedirectUri] = useState("")
  const calendarFlag = useSearchParams().get("calendar")

  const [leave, setLeave] = useState({
    startDate: today(),
    endDate: today(),
    partial: false,
    startTime: "09:00",
    endTime: "13:00",
    reason: "",
  })

  const query = doctorUserId ? `?doctorUserId=${doctorUserId}` : ""

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/availability${query}`)
    const data = await res.json().catch(() => null)
    const savedWindows: Window[] = data?.windows ?? []
    setWindows(savedWindows)
    setLastSaved(savedWindows)
    // Nothing saved yet means there is nothing to protect, and a doctor with
    // no hours cannot be booked at all — so open straight into editing.
    setEditing(savedWindows.length === 0)
    setTimeOff(data?.timeOff ?? [])
  }, [query])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  useEffect(() => {
    setRedirectUri(`${window.location.origin}/api/staff/google-calendar/callback`)
  }, [])

  useEffect(() => {
    if (doctorUserId) return
    let cancelled = false
    fetch("/api/staff/google-calendar")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { connected?: boolean } | null) => {
        if (!cancelled) setMeetConnected(data ? Boolean(data.connected) : null)
      })
      .catch(() => {
        if (!cancelled) setMeetConnected(null)
      })
    return () => {
      cancelled = true
    }
  }, [doctorUserId, calendarFlag])

  const addWindow = () => {
    setWindows((w) => [
      ...w,
      { dayOfWeek: 1, startTime: "09:00", endTime: "13:00", slotMinutes: 30, capacity: 1, isActive: true },
    ])
    setSaved(false)
  }

  const setWindow = (index: number, patch: Partial<Window>) => {
    setWindows((w) => w.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    setSaved(false)
  }

  const removeWindow = (index: number) => {
    setWindows((w) => w.filter((_, i) => i !== index))
    setSaved(false)
  }

  const saveHours = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/availability${query}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ windows }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not save these hours")
        return
      }
      const next: Window[] = data.windows ?? windows
      setWindows(next)
      setLastSaved(next)
      setSaved(true)
      // Saving away every row leaves a doctor unbookable, so that stays open
      // rather than locking an empty table behind an Edit button.
      setEditing(next.length === 0)
    } finally {
      setSaving(false)
    }
  }

  const addLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy("leave")
    setError(null)
    setClash(0)
    try {
      const res = await fetch(`/api/staff/availability${query}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate: leave.startDate,
          endDate: leave.endDate,
          startTime: leave.partial ? leave.startTime : null,
          endTime: leave.partial ? leave.endTime : null,
          reason: leave.reason,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not save that absence")
        return
      }
      // Visits already booked inside it are not cancelled — somebody has to
      // ring those patients, and the screen has to say so.
      setClash(data?.clashingAppointments?.length ?? 0)
      setLeave((l) => ({ ...l, reason: "" }))
      await load()
    } finally {
      setBusy(null)
    }
  }

  const dropLeave = async (id: string) => {
    setBusy(id)
    try {
      await fetch(`/api/staff/availability${query ? `${query}&` : "?"}id=${id}`, { method: "DELETE" })
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center rounded-md border border-border py-12">
        <PredictSpinner />
      </div>
    )
  }

  const weeklyTotal = windows.filter((w) => w.isActive).reduce((n, w) => n + slotCount(w), 0)

  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold">My availability</h1>

      {!doctorUserId && (
        <section className="rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">Google Meet</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect once with the Google account you will take virtual visits on. After that, every
            virtual appointment booked with you gets a Meet link, and that link is emailed to you
            and the patient. The receptionist does not set this up.
          </p>
          {meetConnected ? (
            <p className="mt-3 text-sm text-emerald-700">Google Calendar is connected.</p>
          ) : (
            <a
              href="/api/staff/google-calendar/connect"
              className="mt-3 inline-flex rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Connect Google Calendar
            </a>
          )}
          {calendarFlag === "connected" && (
            <p className="mt-2 text-xs text-emerald-700">Connected. You will not need to do this again.</p>
          )}
          {calendarFlag === "not_configured" && (
            <p className="mt-2 text-xs text-amber-700">Google sign-in is not configured on this server.</p>
          )}
          {(calendarFlag === "denied" || calendarFlag === "no_token") && (
            <p className="mt-2 text-xs text-amber-700">
              Google did not grant Calendar access. Connect again and allow the calendar permission.
            </p>
          )}
          {redirectUri && (
            <p className="mt-3 text-xs text-muted-foreground">
              If Google says redirect_uri_mismatch, add this exact address once under the OAuth
              client&apos;s Authorised redirect URIs: {redirectUri}
            </p>
          )}
        </section>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <section className="rounded-md border border-border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Working hours</h2>
            <p className="text-xs text-muted-foreground">
              A weekly pattern — it holds every week until you change it.
            </p>
          </div>
          {editing && (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground"
 onClick={addWindow}

 >
              <Plus className="h-3.5 w-3.5" />
              Add hours
            </Button>
          )}
        </div>

        {windows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No hours set, so nobody can book with you. Add a window to open your calendar.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Day</th>
                  <th className="w-28 px-2 py-2 font-medium">From</th>
                  <th className="w-28 px-2 py-2 font-medium">To</th>
                  <th className="w-32 px-2 py-2 font-medium">Appointment</th>
                  <th className="w-24 px-2 py-2 font-medium">At once</th>
                  <th className="w-24 px-2 py-2 text-right font-medium">Slots</th>
                  <th className="w-20 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {windows.map((w, i) => (
                  <tr key={i} className={`border-b border-border last:border-0 ${w.isActive ? "" : "opacity-50"}`}>
                    <td className="px-2 py-1.5">
                      <select
                        value={w.dayOfWeek}
                        onChange={(e) => setWindow(i, { dayOfWeek: Number(e.target.value) })}
                        disabled={!editing}
                        className={INPUT}
                      >
                        {DAYS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="time"
                        value={w.startTime}
                        onChange={(e) => setWindow(i, { startTime: e.target.value })}
                        disabled={!editing}
                        className={INPUT}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="time"
                        value={w.endTime}
                        onChange={(e) => setWindow(i, { endTime: e.target.value })}
                        disabled={!editing}
                        className={INPUT}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={w.slotMinutes}
                        onChange={(e) => setWindow(i, { slotMinutes: Number(e.target.value) })}
                        disabled={!editing}
                        className={INPUT}
                      >
                        {SLOT_LENGTHS.map((m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={1}
                        value={w.capacity}
                        onChange={(e) => setWindow(i, { capacity: Number(e.target.value) })}
                        disabled={!editing}
                        className={INPUT}
                      />
                    </td>
                    {/* What the window actually produces. "09:00-13:00, 30 min"
                        is not a number anybody can check at a glance; "8" is. */}
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {slotCount(w) || <span className="text-red-600">0</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      {!editing ? (
                        // Paused stays visible when locked: an hours row that
                        // produces nothing is the whole reason a doctor comes to
                        // this page wondering why nobody can book.
                        <span className="block text-right text-[11px] text-muted-foreground">
                          {w.isActive ? "" : "Paused"}
                        </span>
                      ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="default" className="text-muted-foreground hover:text-foreground"
 onClick={() => setWindow(i, { isActive: !w.isActive })}
 title={w.isActive ? "Pause this window" : "Use this window again"}

 >
                          <Check className={`h-3.5 w-3.5 ${w.isActive ? "" : "opacity-30"}`} />
                        </Button>
                        <Button variant="ghost" size="default" className="text-muted-foreground hover:text-foreground"
 onClick={() => removeWindow(i)}
 aria-label="Remove"

 >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {editing ? (
            <>
              <Button variant="default" size="default"
 onClick={saveHours}
 disabled={saving}

 >
                {saving && <PredictSpinner className="size-4" />}
                Save hours
              </Button>
              {/* Only offered when there is something saved to go back to. */}
              {lastSaved.length > 0 && (
                <Button variant="outline" size="default"
 onClick={() => {
 setWindows(lastSaved)
 setEditing(false)
 setError(null)
 setSaved(false)
 }}
 disabled={saving}

 >
                  Cancel
                </Button>
              )}
            </>
          ) : (
            <Button variant="outline" size="default"
 onClick={() => {
 setEditing(true)
 setSaved(false)
 }}

 >
              <Pencil className="h-3.5 w-3.5" />
              Edit hours
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            {weeklyTotal} appointment{weeklyTotal === 1 ? "" : "s"} a week
          </span>
          {saved && <span className="text-xs text-muted-foreground">Saved.</span>}
        </div>
      </section>

      <section className="rounded-md border border-border p-4">
        <h2 className="text-sm font-semibold">Leave and days off</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Closes these dates without touching your weekly hours.
        </p>

        <form onSubmit={addLeave} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className={LABEL}>From</span>
            <input
              type="date"
              value={leave.startDate}
              onChange={(e) =>
                setLeave((l) => ({
                  ...l,
                  startDate: e.target.value,
                  // Keeps a single day single without a second click.
                  endDate: l.endDate < e.target.value ? e.target.value : l.endDate,
                }))
              }
              className={INPUT}
              required
            />
          </label>
          <label>
            <span className={LABEL}>To</span>
            <input
              type="date"
              value={leave.endDate}
              min={leave.startDate}
              onChange={(e) => setLeave((l) => ({ ...l, endDate: e.target.value }))}
              className={INPUT}
              required
            />
          </label>
          <label className="lg:col-span-2">
            <span className={LABEL}>Reason</span>
            <input
              value={leave.reason}
              onChange={(e) => setLeave((l) => ({ ...l, reason: e.target.value }))}
              placeholder="Optional — shown to whoever tries to book you"
              className={INPUT}
            />
          </label>

          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={leave.partial}
              onChange={(e) => setLeave((l) => ({ ...l, partial: e.target.checked }))}
            />
            <span className="text-sm">Part of the day only</span>
          </label>

          {leave.partial && (
            <>
              <label>
                <span className={LABEL}>Away from</span>
                <input
                  type="time"
                  value={leave.startTime}
                  onChange={(e) => setLeave((l) => ({ ...l, startTime: e.target.value }))}
                  className={INPUT}
                />
              </label>
              <label>
                <span className={LABEL}>Back at</span>
                <input
                  type="time"
                  value={leave.endTime}
                  onChange={(e) => setLeave((l) => ({ ...l, endTime: e.target.value }))}
                  className={INPUT}
                />
              </label>
            </>
          )}

          <div className="sm:col-span-2 lg:col-span-4">
            <Button variant="outline" size="default"
 type="submit"
 disabled={busy === "leave"}

 >
              {busy === "leave" && <PredictSpinner className="size-4" />}
              Add absence
            </Button>
          </div>
        </form>

        {clash > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {clash} appointment{clash === 1 ? " is" : "s are"} already booked inside that absence.
            They have not been cancelled — move or call those patients from the Appointments page.
          </p>
        )}

        {timeOff.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {timeOff.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {t.startDate === t.endDate ? t.startDate : `${t.startDate} → ${t.endDate}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.startTime && t.endTime ? `${t.startTime}–${t.endTime}` : "All day"}
                  {t.reason ? ` · ${t.reason}` : ""}
                </span>
                <Button variant="ghost" size="default" className="ml-auto text-muted-foreground hover:text-foreground"
 onClick={() => dropLeave(t.id)}
 disabled={busy === t.id}
 aria-label="Remove absence"

 >
                  {busy === t.id ? (
                    <PredictSpinner className="size-4" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

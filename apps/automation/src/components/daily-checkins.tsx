"use client"

import { useCallback, useEffect, useState } from "react"
import { CalendarCheck, Dumbbell, Pill, Salad } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Checkin {
  kind: "medicine" | "exercise" | "diet"
  label: string
  template: string
  templateStatus: string
  buttons: string[]
  enabled: boolean
  hour: number
  minute: number
  day: string
  due: number
  sent: number
  delivered: number
  failed: number
  answered: { done: number; partial: number; missed: number }
}

const ICON = { medicine: Pill, exercise: Dumbbell, diet: Salad }

const WHO: Record<Checkin["kind"], string> = {
  medicine: "Patients on an active plan (6 / 21 / 42 days) that includes medicine, every day of the plan.",
  exercise: "Patients with an exercise prescription (daily check-in on), for the plan or the prescription's duration.",
  diet: "Patients with a diet protocol, while their plan runs or for 42 days after it was written.",
}

const pad = (n: number) => String(n).padStart(2, "0")

function clock(hour: number, minute: number) {
  const h = hour % 12 || 12
  return `${h}:${pad(minute)} ${hour < 12 ? "am" : "pm"}`
}

function dayLabel(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
}

/**
 * The three daily check-ins, as automations: each morning a patient on a plan
 * is asked on WhatsApp about the day before, and their tap is logged on their
 * profile. Switched on and off, and timed, here; the worker does the sending.
 */
export function DailyCheckins() {
  const [list, setList] = useState<Checkin[] | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/checkins")
    const data = await res.json().catch(() => null)
    setList(res.ok ? (data?.checkins ?? []) : [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save(kind: string, patch: Partial<Pick<Checkin, "enabled" | "hour" | "minute">>) {
    setSaving(kind)
    const res = await fetch("/api/checkins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ...patch }),
    })
    setSaving(null)
    if (!res.ok) return toast.error("Could not save")
    toast.success("Saved")
    await load()
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarCheck className="h-4 w-4 text-primary" /> Daily check-ins
        </h2>
        <p className="text-xs text-muted-foreground">
          Every morning, about the day before — the patient&apos;s tap is logged on their profile (Daily log).
        </p>
      </div>

      {list === null ? (
        <div className="flex justify-center rounded-md border border-border py-6">
          <PredictSpinner className="size-5" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {list.map((c) => {
            const Icon = ICON[c.kind]
            const approved = c.templateStatus === "approved"
            const live = c.enabled && approved
            const answered = c.answered.done + c.answered.partial + c.answered.missed
            return (
              <article key={c.kind} className="flex flex-col gap-3 rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-primary/10 p-1.5 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{c.label} check-in</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{c.template}</p>
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--primary)]"
                      checked={c.enabled}
                      disabled={saving === c.kind}
                      onChange={(e) => save(c.kind, { enabled: e.target.checked })}
                    />
                    {c.enabled ? "On" : "Off"}
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      live
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {!approved ? `Template ${c.templateStatus}` : c.enabled ? "Live" : "Switched off"}
                  </span>
                  <span className="text-muted-foreground">Sends daily at</span>
                  <input
                    type="time"
                    key={`${c.hour}:${c.minute}`}
                    defaultValue={`${pad(c.hour)}:${pad(c.minute)}`}
                    disabled={saving === c.kind}
                    onBlur={(e) => {
                      const [h, m] = e.target.value.split(":").map(Number)
                      if (Number.isFinite(h) && Number.isFinite(m) && (h !== c.hour || m !== c.minute)) {
                        save(c.kind, { hour: h, minute: m })
                      }
                    }}
                    className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs"
                    aria-label={`${c.label} check-in send time`}
                  />
                  <span className="text-muted-foreground">IST</span>
                </div>

                <p className="text-[11px] leading-relaxed text-muted-foreground">{WHO[c.kind]}</p>

                <div className="flex flex-wrap gap-1">
                  {c.buttons.map((b) => (
                    <span key={b} className="rounded border border-border px-1.5 py-0.5 text-[11px]">
                      {b}
                    </span>
                  ))}
                </div>

                <div className="mt-auto rounded-md bg-muted/40 p-2 text-xs">
                  <p className="mb-1 font-medium">About {dayLabel(c.day)}</p>
                  <dl className="grid grid-cols-4 gap-1 text-center">
                    <Stat label="Due" value={c.due} />
                    <Stat label="Sent" value={c.sent} />
                    <Stat label="Delivered" value={c.delivered} />
                    <Stat label="Answered" value={answered} />
                  </dl>
                  {answered > 0 && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      <span className="text-emerald-700 dark:text-emerald-400">{c.answered.done} fully</span> ·{" "}
                      <span className="text-amber-700 dark:text-amber-400">{c.answered.partial} partly</span> ·{" "}
                      <span className="text-red-600 dark:text-red-400">{c.answered.missed} missed</span>
                    </p>
                  )}
                  {c.sent === 0 && live && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">Goes out at {clock(c.hour, c.minute)}.</p>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

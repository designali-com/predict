"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import { Activity, Clock, PhoneCall, TriangleAlert } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { PageHeader } from "@workspace/ui/components/page-header"

interface Settings {
  id: string
  quietHoursEnabled: boolean
  quietStartHour: number
  quietEndHour: number
  timezone: string
  firstResponseMinutes: number
  callbackReminders: boolean
  notifyAssignee: boolean
  managerEmail: string | null
}

interface Health {
  name: string
  secondsAgo: number
  healthy: boolean
  lastSeenAt: string
}

const inputClass =
  "rounded-md border border-black/18 bg-white px-3 py-2 text-sm text-black focus:border-black/40 focus:outline-none dark:border-white/15 dark:bg-black dark:text-white"

const card =
  "rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black"

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hourLabel = (h: number) =>
  `${((h + 11) % 12) + 1}:00 ${h < 12 ? "am" : "pm"}`

function ago(seconds: number) {
  if (seconds < 90) return `${seconds}s ago`
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`
  return `${Math.round(seconds / 3600)} h ago`
}

export default function AutomationSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [health, setHealth] = useState<Health[]>([])
  const [now, setNow] = useState<{ quiet: boolean; resumesAt: string | null } | null>(null)
  const [clinicName, setClinicName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await fetch("/api/automation-settings").then((r) => r.json())
    setSettings(d.settings ?? null)
    setHealth(d.health ?? [])
    setNow(d.now ?? null)
    setClinicName(d.clinic?.name ?? null)
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [load])

  async function save() {
    if (!settings) return
    setSaving(true)
    setError(null)
    setSaved(false)
    const res = await fetch("/api/automation-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      toast.error(d.error ?? "Could not save")
      return setError(d.error ?? "Could not save")
    }
    setSettings(d.settings)
    setSaved(true)
    toast.success("Automation settings saved")
    load()
  }

  if (loading || !settings) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  const set = (patch: Partial<Settings>) => {
    setSettings({ ...settings, ...patch })
    setSaved(false)
  }

  const worker = health.find((h) => h.name === "worker")
  const webhook = health.find((h) => h.name === "webhook")

  return (
    <div className="space-y-4">
      <PageHeader
        title="Automation settings"
        description={
          <>
            {clinicName ? <>For <b>{clinicName}</b>. </> : null}
            The house rules every flow runs under, and whether the machinery behind them is actually running. Quiet
            hours and the first-response window are set per clinic; the worker and webhook below serve all of them.
          </>
        }
        actions={
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-emerald-700">Saved.</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
            <Button onClick={save} disabled={saving}>
              {saving && <PredictSpinner className="size-4" />}
              Save
            </Button>
          </div>
        }
      />

      {/* Health first: if the worker is down, nothing else on this page matters. */}
      <section className={`${card} space-y-3`}>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4 text-muted-foreground" /> Is it running?
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: "Worker (runs the flows)", h: worker },
            { label: "Webhook server (receives leads)", h: webhook },
          ].map(({ label, h }) => (
            <div
              key={label}
              className={`rounded-md border px-3 py-3 text-sm ${
                h?.healthy
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
                  : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
              }`}
            >
              <div className="font-medium">{label}</div>
              <div className={`text-xs ${h?.healthy ? "text-emerald-800 dark:text-emerald-200" : "text-red-700 dark:text-red-200"}`}>
                {h ? (h.healthy ? `running · seen ${ago(h.secondsAgo)}` : `NOT running · last seen ${ago(h.secondsAgo)}`) : "never started"}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Both must be running for leads to arrive and messages to go out. If one is red, restart it on the server
          (<span className="font-mono">pnpm worker</span> / <span className="font-mono">pnpm webhook</span>).
        </p>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <section className={`${card} space-y-3`}>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-muted-foreground" /> Quiet hours
          </h2>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.quietHoursEnabled}
              onChange={(e) => set({ quietHoursEnabled: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              Hold automated messages at night
              <span className="block text-xs text-muted-foreground">
                A message due during quiet hours waits and goes out when the window opens — it is never skipped.
                Replies to someone who just messaged us are not held.
              </span>
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              From
              <select
                value={settings.quietStartHour}
                onChange={(e) => set({ quietStartHour: Number(e.target.value) })}
                className={`${inputClass} mt-1 block w-full`}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Until
              <select
                value={settings.quietEndHour}
                onChange={(e) => set({ quietEndHour: Number(e.target.value) })}
                className={`${inputClass} mt-1 block w-full`}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Clock
              <select
                value={settings.timezone}
                onChange={(e) => set({ timezone: e.target.value })}
                className={`${inputClass} mt-1 block w-full`}
              >
                {["Asia/Kolkata", "Asia/Dubai", "Europe/London", "UTC"].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {now?.quiet && (
            <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              It is quiet hours right now — automated messages are waiting until{" "}
              {now.resumesAt ? new Date(now.resumesAt).toLocaleString("en-IN", { timeStyle: "short", dateStyle: "medium" }) : "the window opens"}.
            </p>
          )}
        </section>

        <section className={`${card} space-y-3`}>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <PhoneCall className="h-4 w-4 text-muted-foreground" /> Leads nobody has touched
          </h2>
          <label className="block text-xs text-muted-foreground">
            Flag after (minutes)
            <input
              type="number"
              min={0}
              max={1440}
              value={settings.firstResponseMinutes}
              onChange={(e) => set({ firstResponseMinutes: Number(e.target.value) })}
              className={`${inputClass} mt-1 block w-full max-w-xs`}
            />
            <span className="mt-1 block">0 = switched off</span>
          </label>
          <p className="text-[11px] text-muted-foreground">
            A lead still marked New after this long moves to <b>Waiting too long</b> at the top of the{" "}
            <a href="/call-queue" className="underline underline-offset-2">call queue</a>, raises a task for its
            owner and fires LEAD_UNWORKED for any flow listening. Nothing is emailed — the queue is where the people
            who can make the call are already looking.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.callbackReminders}
              onChange={(e) => set({ callbackReminders: e.target.checked })}
            />
            When a promised callback time arrives, raise a task and fire CALLBACK_DUE
          </label>
          <p className="text-[11px] text-muted-foreground">
            Due callbacks are on the call queue either way; this adds the task and the automation trigger.
          </p>
        </section>
      </div>
    </div>
  )
}

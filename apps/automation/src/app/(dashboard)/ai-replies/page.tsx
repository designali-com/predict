"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import { Bot, MessageSquare, TriangleAlert } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { PageHeader } from "@workspace/ui/components/page-header"

interface Config {
  enabled: boolean
  provider: string
  model: string
  temperature: number
  maxOutputTokens: number
  businessInfo: string
  instructions: string
  dailyLimitPerContact: number
  humanTakeoverMinutes: number
  handoffKeywords: string
  handoffCreatesTask: boolean
}

interface Provider {
  value: string
  label: string
  models: string[]
  envKey: string
}

const inputClass =
  "rounded-md border border-black/18 bg-white px-3 py-2 text-sm text-black focus:border-black/40 focus:outline-none dark:border-white/15 dark:bg-black dark:text-white"

const card =
  "rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black"

const PLACEHOLDER = `Example — write it the way you would tell a new receptionist:

Predict Delhi: 2nd floor, ... , open Mon–Sat 9am–7pm, closed Sunday.
Predict Kolkata: ...
What we do: non-surgical physiotherapy for knee, back, neck and shoulder pain.
First visit: a 45-minute assessment, ₹____, includes ...
A course of treatment is decided after that assessment, so the cost depends on the plan.
We do not do surgery. We do not prescribe medicines over WhatsApp.
To book: offer an assessment slot and ask for their preferred day.`

export default function AiRepliesPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [keyPresent, setKeyPresent] = useState<Record<string, boolean>>({})
  const [clinicName, setClinicName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const d = await fetch("/api/ai-replies").then((r) => r.json())
    setConfig(d.config ?? null)
    setProviders(d.providers ?? [])
    setKeyPresent(d.keyPresent ?? {})
    setClinicName(d.clinic?.name ?? null)
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  async function save() {
    if (!config) return
    setSaving(true)
    setError(null)
    setSaved(false)
    const res = await fetch("/api/ai-replies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      toast.error(d.error ?? "Could not save")
      return setError(d.error ?? "Could not save")
    }
    setConfig(d.config)
    setSaved(true)
    toast.success("AI reply settings saved")
  }

  if (loading || !config) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  const set = (patch: Partial<Config>) => {
    setConfig({ ...config, ...patch })
    setSaved(false)
  }
  const provider = providers.find((p) => p.value === config.provider)
  const missingKey = provider && keyPresent[provider.value] === false

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Bot className="h-5 w-5 text-muted-foreground" />}
        title="AI replies"
        description={
          <>
            {clinicName ? <>For <b>{clinicName}</b>. Each clinic answers with its own information. </> : null}
            When someone replies to a message and no flow branch and no keyword matches, the AI answers instead of
            leaving them waiting. It answers only from what you write below, and hands over to the lead&apos;s owner
            whenever it is not sure.
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

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.9fr)]">
        <section className={`${card} flex min-h-[36rem] flex-col gap-2`}>
          <h2 className="text-sm font-medium">What the clinic does, charges and when it opens</h2>
          <p className="text-xs text-muted-foreground">
            The only facts it may state. Anything not written here it will not answer — it hands over instead. Prices,
            timings and addresses belong here.
          </p>
          <textarea
            value={config.businessInfo}
            onChange={(e) => set({ businessInfo: e.target.value })}
            placeholder={PLACEHOLDER}
            className={`${inputClass} min-h-0 w-full flex-1 resize-y font-mono text-xs`}
          />
        </section>

        <div className="space-y-4">
          <label className={`${card} flex items-start gap-2 text-sm`}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => set({ enabled: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Answer unmatched replies</span>
              <span className="block text-xs text-muted-foreground">
                Off by default. Replies still arrive in the Inbox either way.
              </span>
            </span>
          </label>

          {missingKey && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {provider?.envKey} is not set on the server, so nothing can be generated. Add it to the automation
              app&apos;s .env and restart the webhook.
            </p>
          )}

          <section className={`${card} space-y-2`}>
            <h2 className="text-sm font-medium">How it should sound</h2>
            <textarea
              value={config.instructions}
              onChange={(e) => set({ instructions: e.target.value })}
              rows={4}
              placeholder="e.g. Warm and short. Reply in Hinglish unless they write in English. Always end by offering an assessment slot."
              className={`${inputClass} w-full`}
            />
          </section>

          <section className={`${card} space-y-3`}>
            <h2 className="text-sm font-medium">Limits and hand-over</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Most AI replies to one person per day
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={config.dailyLimitPerContact}
                  onChange={(e) => set({ dailyLimitPerContact: Number(e.target.value) })}
                  className={`${inputClass} mt-1 block w-full`}
                />
                <span className="mt-1 block">After this, it stops and raises a task instead.</span>
              </label>
              <label className="text-xs text-muted-foreground">
                Stay quiet if a person replied in the last (minutes)
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={config.humanTakeoverMinutes}
                  onChange={(e) => set({ humanTakeoverMinutes: Number(e.target.value) })}
                  className={`${inputClass} mt-1 block w-full`}
                />
                <span className="mt-1 block">So it never talks over a caller mid-conversation.</span>
              </label>
            </div>
            <label className="block text-xs text-muted-foreground">
              Always hand over when the message contains (comma separated)
              <input
                value={config.handoffKeywords}
                onChange={(e) => set({ handoffKeywords: e.target.value })}
                placeholder="refund, complaint, lawyer, emergency, chest pain"
                className={`${inputClass} mt-1 block w-full`}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.handoffCreatesTask}
                onChange={(e) => set({ handoffCreatesTask: e.target.checked })}
              />
              Raise a task for the lead&apos;s owner on every hand-over
            </label>
          </section>

          <section className={`${card} space-y-3`}>
            <h2 className="text-sm font-medium">Model</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Provider
                <select
                  value={config.provider}
                  onChange={(e) => {
                    const next = providers.find((p) => p.value === e.target.value)
                    set({ provider: e.target.value, model: next?.models[0] ?? config.model })
                  }}
                  className={`${inputClass} mt-1 block w-full`}
                >
                  {providers.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Model
                <select
                  value={config.model}
                  onChange={(e) => set({ model: e.target.value })}
                  className={`${inputClass} mt-1 block w-full`}
                >
                  {(provider?.models ?? [config.model]).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs text-muted-foreground">
              Creativity ({config.temperature})
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={config.temperature}
                onChange={(e) => set({ temperature: Number(e.target.value) })}
                className="mt-2 block w-full"
              />
            </label>
          </section>
        </div>
      </div>

      <Tester />
    </div>
  )
}

/** Try a message against the saved settings. Sends nothing. */
function Tester() {
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{
    reply?: string
    handoff?: boolean
    handoffReason?: string
    intent?: string
    error?: string
  } | null>(null)

  async function run() {
    setBusy(true)
    setResult(null)
    const res = await fetch("/api/ai-replies/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    })
    setResult(await res.json().catch(() => ({ error: "No answer" })))
    setBusy(false)
  }

  return (
    <section className={`${card} space-y-2`}>
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="h-4 w-4 text-muted-foreground" /> Try a reply
      </h2>
      <p className="text-xs text-muted-foreground">
        Type what a lead might send. Nothing is sent to anyone — this only shows what it would say. Save first.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. knee pain ka kitna kharcha aayega?"
          className={`${inputClass} min-w-0 flex-1`}
        />
        <Button
          onClick={run}
          disabled={busy || !message.trim()} variant="outline">
          {busy && <PredictSpinner className="size-4" />}
          Try
        </Button>
      </div>
      {result?.error && <p className="text-xs text-red-600">{result.error}</p>}
      {result?.reply && (
        <div className="space-y-1 rounded-md bg-black/[0.03] p-3 text-sm dark:bg-white/[0.04]">
          <p>{result.reply}</p>
          <p className="text-[11px] text-muted-foreground">
            Read as: {result.intent}
            {result.handoff ? ` · hands over to a person — ${result.handoffReason}` : " · answered on its own"}
          </p>
        </div>
      )}
    </section>
  )
}

"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleAlert,
  History,
  MessageSquareText,
  Moon,
  PauseCircle,
  PlayCircle,
  Workflow,
} from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"

interface Rule {
  enabled: boolean
  templateKey: string | null
  delayMinutes: number
  respectQuietHours: boolean
  lastSentAt: string | null
  sentCount: number
}

interface Send {
  status: string
  detail: string | null
  templateKey: string | null
  createdAt: string
  sendAt: string | null
  sentAt: string | null
  contactName: string | null
}

interface Moment {
  key: string
  group: string
  label: string
  when: string
  eventType: string
  variables: string[]
  rule: Rule | null
  flows: { id: string; name: string }[]
  recent: Send[]
  overrides: { doctorUserId: string; doctorName: string | null; templateKey: string }[]
}

interface Template {
  key: string
  name: string
  status: string
  category: string | null
  bodyText: string | null
  headerType: string | null
  variables: string[]
  buttons: { type: string; url: string | null }[]
  needsLinkValue: boolean
}

interface Clinician {
  id: string
  name: string
  role: string
}

function templateOption(t: Template) {
  const media =
    t.headerType === "IMAGE" ? " · image" : t.headerType === "VIDEO" ? " · video" : t.headerType === "DOCUMENT" ? " · document" : ""
  const status = t.status !== "approved" ? ` (${t.status})` : ""
  const link = t.needsLinkValue ? " — link button not supported here" : ""
  return `${t.name}${media}${status}${link}`
}

const inputClass =
  "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none disabled:opacity-60"

const UNITS = [
  { label: "minutes", minutes: 1 },
  { label: "hours", minutes: 60 },
  { label: "days", minutes: 60 * 24 },
]

/** The largest unit that divides the delay evenly, so 120 reads "2 hours". */
function splitDelay(minutes: number) {
  const unit = [...UNITS].reverse().find((u) => minutes > 0 && minutes % u.minutes === 0) ?? UNITS[0]!
  return { amount: minutes / unit.minutes, unit }
}

function when(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-emerald-50 text-emerald-800",
  queued: "bg-sky-50 text-sky-800",
  skipped: "bg-amber-50 text-amber-800",
  failed: "bg-red-50 text-red-700",
}

/**
 * Stage Messages — which WhatsApp template goes out at each lead and
 * appointment moment.
 *
 * Templates are only chosen here. They are written, submitted and approved on
 * the Templates page, and only an approved one can be switched on. Sequences
 * (nurture, re-engagement, treatment check-ins) are flows, not moments.
 */
export default function StageMessagesPage() {
  const [moments, setMoments] = useState<Moment[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [doctors, setDoctors] = useState<Clinician[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Which moments are open. All closed to start: the rows alone say what each sends.
  const [open, setOpen] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const res = await fetch("/api/stage-messages")
    if (!res.ok) return
    const d = await res.json()
    setMoments(d.moments)
    setTemplates(d.templates)
    setDoctors(d.doctors ?? [])
    setLabels(d.variableLabels)
    setPaused(d.paused)
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  async function save(key: string, patch: Partial<Rule>) {
    setBusy(key)
    setErrors((e) => ({ ...e, [key]: "" }))
    try {
      const res = await fetch(`/api/stage-messages/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || "Could not save")
      setMoments((all) => all.map((m) => (m.key === key ? { ...m, rule: d.rule } : m)))
      toast.success("Stage message saved")
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: err instanceof Error ? err.message : "Could not save" }))
      toast.error(err instanceof Error ? err.message : "Could not save")
    } finally {
      setBusy(null)
    }
  }

  async function saveDoctor(key: string, doctorUserId: string, templateKey: string) {
    setBusy(key)
    setErrors((e) => ({ ...e, [key]: "" }))
    try {
      const res = await fetch(`/api/stage-messages/${key}/doctors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorUserId, templateKey }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || "Could not save")
      await load()
      toast.success("Special doctor saved")
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: err instanceof Error ? err.message : "Could not save" }))
      toast.error(err instanceof Error ? err.message : "Could not save")
    } finally {
      setBusy(null)
    }
  }

  async function removeDoctor(key: string, doctorUserId: string) {
    setBusy(key)
    setErrors((e) => ({ ...e, [key]: "" }))
    try {
      const res = await fetch(`/api/stage-messages/${key}/doctors`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorUserId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || "Could not remove")
      await load()
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: err instanceof Error ? err.message : "Could not remove" }))
      toast.error(err instanceof Error ? err.message : "Could not remove")
    } finally {
      setBusy(null)
    }
  }
  async function togglePaused() {
    const next = !paused
    if (next && !confirm("Pause every stage message? Nothing below will send until you resume.")) return
    setBusy("__paused")
    const res = await fetch("/api/stage-messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: next }),
    })
    if (res.ok) {
      setPaused(next)
      toast.success(next ? "Stage messages paused" : "Stage messages resumed")
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? "Couldn't save")
    }
    setBusy(null)
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  const groups = [...new Set(moments.map((m) => m.group))]
  const allOpen = moments.length > 0 && moments.every((m) => open.has(m.key))
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Stage messages"
        description={
          <>
            The one WhatsApp message each moment sends. Choose an approved template — templates are written and sent
            for approval on the{" "}
            <Link href="/templates" className="underline">
              Templates
            </Link>{" "}
            page. Multi-message sequences (nurture, re-engagement, treatment check-ins) are{" "}
            <Link href="/flows" className="underline">
              Flows
            </Link>
            .
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOpen(allOpen ? new Set() : new Set(moments.map((m) => m.key)))}
            >
              {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
              {allOpen ? "Collapse all" : "Expand all"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={paused ? "default" : "outline"}
              onClick={togglePaused}
              disabled={busy === "__paused"}
              className={paused ? "bg-emerald-600 text-white hover:bg-emerald-700" : undefined}
            >
              {paused ? <PlayCircle /> : <PauseCircle />}
              {paused ? "Resume all" : "Pause all"}
            </Button>
          </div>
        }
      />

      {paused && (
        <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <PauseCircle className="h-4 w-4 shrink-0" />
          All stage messages are paused. Nothing is sent, and messages already waiting are dropped when they come due.
        </p>
      )}

      {groups.map((group) => {
        const inGroup = moments.filter((m) => m.group === group)
        const liveCount = inGroup.filter((m) => momentState(m, templates, paused).tone === "live").length
        return (
          <section key={group} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h2>
              <span className="text-[11px] text-muted-foreground">
                {liveCount} of {inGroup.length} live
              </span>
            </div>
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {inGroup.map((m) => (
                <MomentCard
                  key={m.key}
                  moment={m}
                  templates={templates}
                  doctors={doctors}
                  labels={labels}
                  busy={busy === m.key}
                  error={errors[m.key]}
                  paused={paused}
                  open={open.has(m.key)}
                  onToggle={() => toggle(m.key)}
                  onSave={(patch) => save(m.key, patch)}
                  onSaveDoctor={(doctorUserId, templateKey) => saveDoctor(m.key, doctorUserId, templateKey)}
                  onRemoveDoctor={(doctorUserId) => removeDoctor(m.key, doctorUserId)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

type StateTone = "live" | "off" | "attention" | "paused"

/** One word for where a moment stands, and why — the collapsed row's badge. */
function momentState(moment: Moment, templates: Template[], paused: boolean): { tone: StateTone; label: string; issues: number } {
  const rule = moment.rule
  const enabled = rule?.enabled ?? false
  const template = templates.find((t) => t.key === rule?.templateKey) ?? null
  const unavailable = template ? template.variables.filter((v) => !moment.variables.includes(v)) : []
  const notApproved = !!template && template.status !== "approved"
  const issues = (enabled && !template ? 1 : 0) + (notApproved ? 1 : 0) + (unavailable.length ? 1 : 0)
  if (!enabled) return { tone: "off", label: "Off", issues }
  if (issues) return { tone: "attention", label: "Needs attention", issues }
  if (paused) return { tone: "paused", label: "Paused", issues }
  return { tone: "live", label: "Live", issues }
}

const STATE_STYLE: Record<StateTone, string> = {
  live: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  off: "bg-muted text-muted-foreground",
  attention: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  paused: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
}

function delayText(minutes: number) {
  if (minutes <= 0) return "straight away"
  const { amount, unit } = splitDelay(minutes)
  const name = amount === 1 ? unit.label.replace(/s$/, "") : unit.label
  return `after ${amount} ${name}`
}

const BUTTON_LABEL: Record<string, string> = {
  URL: "Link",
  PHONE_NUMBER: "Call",
  QUICK_REPLY: "Quick reply",
  COPY_CODE: "Copy code",
}

function MomentCard({
  moment,
  templates,
  doctors,
  labels,
  busy,
  error,
  paused,
  open,
  onToggle,
  onSave,
  onSaveDoctor,
  onRemoveDoctor,
}: {
  moment: Moment
  templates: Template[]
  doctors: Clinician[]
  labels: Record<string, string>
  busy: boolean
  error?: string
  paused: boolean
  open: boolean
  onToggle: () => void
  onSave: (patch: Partial<Rule>) => void
  onSaveDoctor: (doctorUserId: string, templateKey: string) => void
  onRemoveDoctor: (doctorUserId: string) => void
}) {
  const rule = moment.rule
  const enabled = rule?.enabled ?? false
  const template = templates.find((t) => t.key === rule?.templateKey) ?? null
  const { amount, unit } = splitDelay(rule?.delayMinutes ?? 0)
  const [delayAmount, setDelayAmount] = useState(String(amount))
  const [delayUnit, setDelayUnit] = useState(unit.minutes)
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    setDelayAmount(String(amount))
    setDelayUnit(unit.minutes)
  }, [amount, unit.minutes])

  const unavailable = template ? template.variables.filter((v) => !moment.variables.includes(v)) : []
  const notApproved = template && template.status !== "approved"
  const state = momentState(moment, templates, paused)
  const bodyId = `moment-${moment.key}`

  function saveDelay(nextAmount = delayAmount, nextUnit = delayUnit) {
    const n = Math.max(0, Number(nextAmount) || 0)
    const minutes = Math.round(n * nextUnit)
    if (minutes !== (rule?.delayMinutes ?? 0)) onSave({ delayMinutes: minutes })
  }

  return (
    <div className={open ? "bg-muted/20" : undefined}>
      {/* The row: what it is, what it sends, where it stands. Click to open. */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          />
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
              state.tone === "live" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"
            }`}
          >
            <MessageSquareText className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium">{moment.label}</span>
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATE_STYLE[state.tone]}`}>
                {state.tone === "attention" && <CircleAlert className="h-3 w-3" />}
                {state.label}
              </span>
              {busy && <PredictSpinner className="size-3.5" />}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {moment.when}
              {" · "}
              {template ? (
                <>
                  <span className="text-foreground/80">{template.name}</span> {delayText(rule?.delayMinutes ?? 0)}
                </>
              ) : (
                <span className="italic">no template chosen</span>
              )}
            </span>
          </span>
          <span className="hidden shrink-0 text-right text-[11px] text-muted-foreground sm:block">
            {rule?.sentCount ? (
              <>
                <span className="block font-medium tabular-nums text-foreground">{rule.sentCount.toLocaleString("en-IN")} sent</span>
                last {when(rule.lastSentAt)}
              </>
            ) : (
              "Not sent yet"
            )}
          </span>
        </button>
        <Switch on={enabled} disabled={busy} label={`${moment.label} ${enabled ? "on" : "off"}`} onChange={() => onSave({ enabled: !enabled })} />
      </div>

      {open && (
        <div id={bodyId} className="border-t border-border px-4 pb-4 pt-4 sm:pl-[3.75rem]">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            {/* Settings */}
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Field label={moment.key === "appointment_booked" ? "Template — everyone else" : "Template"}>
                  <select
                    value={rule?.templateKey ?? ""}
                    disabled={busy}
                    onChange={(e) => onSave({ templateKey: e.target.value || null })}
                    className={`${inputClass} w-full`}
                  >
                    <option value="">— choose a template —</option>
                    {templates.map((t) => (
                      <option key={t.key} value={t.key} disabled={t.needsLinkValue}>
                        {templateOption(t)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Send">
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      min={0}
                      value={delayAmount}
                      disabled={busy}
                      onChange={(e) => setDelayAmount(e.target.value)}
                      onBlur={() => saveDelay()}
                      aria-label="Delay"
                      className={`${inputClass} w-20`}
                    />
                    <select
                      value={delayUnit}
                      disabled={busy}
                      onChange={(e) => {
                        setDelayUnit(Number(e.target.value))
                        saveDelay(delayAmount, Number(e.target.value))
                      }}
                      aria-label="Delay unit"
                      className={inputClass}
                    >
                      {UNITS.map((u) => (
                        <option key={u.minutes} value={u.minutes}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>
              </div>
              <p className="-mt-2 text-[11px] text-muted-foreground">
                {(rule?.delayMinutes ?? 0) === 0 ? "Sends the moment it happens. Set a delay to wait first." : `Sends ${delayText(rule?.delayMinutes ?? 0)} the moment happens.`}
              </p>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-background px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={rule?.respectQuietHours ?? true}
                  disabled={busy}
                  onChange={(e) => onSave({ respectQuietHours: e.target.checked })}
                  className="mt-0.5 size-4 accent-[var(--primary)]"
                />
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Moon className="h-3.5 w-3.5 text-muted-foreground" /> Respect quiet hours
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Hold it during the quiet hours set in Settings and send it in the morning.
                  </span>
                </span>
              </label>

              {(notApproved || (enabled && !template) || unavailable.length > 0 || moment.flows.length > 0 || error) && (
                <div className="space-y-1.5">
                  {notApproved && (
                    <Warning>
                      &ldquo;{template!.name}&rdquo; is {template!.status}. It will not send until Meta approves it.
                    </Warning>
                  )}
                  {enabled && !template && <Warning>On, but no template is chosen — nothing will send.</Warning>}
                  {unavailable.length > 0 && (
                    <Warning>
                      This template asks for {unavailable.map((v) => labels[v] ?? v).join(", ")}, which this moment
                      doesn&apos;t have — {unavailable.length === 1 ? "it" : "they"} will be blank. Available here:{" "}
                      {moment.variables.map((v) => labels[v] ?? v).join(", ")}.
                    </Warning>
                  )}
                  {moment.flows.length > 0 && (
                    <p className="flex items-start gap-2 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">
                      <Workflow className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        The flow{moment.flows.length > 1 ? "s" : ""}{" "}
                        {moment.flows.map((f, i) => (
                          <span key={f.id}>
                            {i > 0 && ", "}
                            <Link href={`/flows/${f.id}`} className="font-medium underline">
                              {f.name}
                            </Link>
                          </span>
                        ))}{" "}
                        also start{moment.flows.length > 1 ? "" : "s"} on this moment. If it sends a message too, the
                        person gets both.
                      </span>
                    </p>
                  )}
                  {error && <Warning tone="red">{error}</Warning>}
                </div>
              )}

              {moment.key === "appointment_booked" && (
                <SpecialDoctors
                  moment={moment}
                  templates={templates}
                  doctors={doctors}
                  busy={busy}
                  onSave={onSaveDoctor}
                  onRemove={onRemoveDoctor}
                />
              )}
            </div>

            {/* What the person will see. */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">What they get</p>
              {template?.bodyText ? (
                <div className="rounded-lg bg-[#efeae2] p-3 dark:bg-white/[0.04]">
                  <div className="max-w-full rounded-lg rounded-tl-none bg-white px-3 py-2 text-[13px] leading-relaxed text-black shadow-sm dark:bg-[#1f2c34] dark:text-white">
                    {template.headerType && template.headerType !== "NONE" && template.headerType !== "TEXT" && (
                      <div className="-mx-1 -mt-0.5 mb-2 flex h-20 items-center justify-center rounded-md bg-black/[0.06] text-[11px] text-black/50 dark:bg-white/10 dark:text-white/50">
                        {template.headerType.toLowerCase()} from the template
                      </div>
                    )}
                    <div className="whitespace-pre-line break-words">
                      <Preview body={template.bodyText} variables={template.variables} labels={labels} />
                    </div>
                  </div>
                  {template.buttons.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {template.buttons.map((b, i) => (
                        <div
                          key={i}
                          className="rounded-lg bg-white py-1.5 text-center text-[13px] font-medium text-[#027eb5] shadow-sm dark:bg-[#1f2c34] dark:text-[#53bdeb]"
                        >
                          {BUTTON_LABEL[b.type] ?? "Button"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                  Choose a template to see the message.
                </p>
              )}
            </div>
          </div>

          {/* Activity */}
          <div className="mt-4 border-t border-border pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {rule?.sentCount
                  ? `Sent ${rule.sentCount.toLocaleString("en-IN")} time${rule.sentCount === 1 ? "" : "s"} · last ${when(rule.lastSentAt)}`
                  : "Not sent yet"}
              </span>
              {moment.recent.length > 0 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowLog((s) => !s)} aria-expanded={showLog}>
                  <History className="h-3.5 w-3.5" /> {showLog ? "Hide recent sends" : `Recent sends (${moment.recent.length})`}
                </Button>
              )}
            </div>
            {showLog && (
              <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-background text-xs">
                {moment.recent.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${STATUS_STYLE[s.status] ?? ""}`}>{s.status}</span>
                    <span className="font-medium">{s.contactName ?? "—"}</span>
                    <span className="text-muted-foreground">
                      {s.status === "sent" ? when(s.sentAt) : s.status === "queued" ? `due ${when(s.sendAt)}` : when(s.createdAt)}
                    </span>
                    {s.detail && <span className="text-muted-foreground">· {s.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  )
}

/** On / off, as a switch with its word beside it. */
function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="flex shrink-0 items-center gap-2 rounded-md text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <span className={`w-6 text-right ${on ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
        {on ? "On" : "Off"}
      </span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-muted-foreground/30"}`}>
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-[left] duration-150 ${on ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
    </button>
  )
}

/** The body with each {{n}} shown as the value it will be filled with. */
function SpecialDoctors({
  moment,
  templates,
  doctors,
  busy,
  onSave,
  onRemove,
}: {
  moment: Moment
  templates: Template[]
  doctors: Clinician[]
  busy: boolean
  onSave: (doctorUserId: string, templateKey: string) => void
  onRemove: (doctorUserId: string) => void
}) {
  const [doctorId, setDoctorId] = useState("")
  const [templateKey, setTemplateKey] = useState("")
  const overrides = moment.overrides ?? []
  const taken = new Set(overrides.map((o) => o.doctorUserId))
  const available = doctors.filter((d) => !taken.has(d.id))

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-sm font-medium">Special doctors</p>
      <p className="mt-1 text-xs text-muted-foreground">
        When the appointment is with one of these people, their template is sent instead — with that
        template&apos;s own image or video. Everyone else gets the template above. The image is part of
        the template, so a different photo or video means a different template on the Templates page.
      </p>

      {overrides.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">No special doctor yet. Every booking uses the template above.</p>
      )}

      <ul className="mt-3 space-y-2">
        {overrides.map((o) => {
          const person = doctors.find((d) => d.id === o.doctorUserId)
          const chosen = templates.find((t) => t.key === o.templateKey)
          return (
            <li key={o.doctorUserId} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
              <div className="text-sm">
                <span className="font-medium">{o.doctorName || person?.name || "Unknown"}</span>
                {person?.role === "nutritionist" && (
                  <span className="ml-1 text-xs text-muted-foreground">Nutritionist</span>
                )}
              </div>
              <label className="text-xs text-muted-foreground">
                Their template
                <select
                  value={o.templateKey}
                  disabled={busy}
                  onChange={(e) => e.target.value && onSave(o.doctorUserId, e.target.value)}
                  className={`${inputClass} mt-1 block w-full`}
                >
                  {templates.map((t) => (
                    <option key={t.key} value={t.key} disabled={t.needsLinkValue}>
                      {templateOption(t)}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                disabled={busy}
                onClick={() => onRemove(o.doctorUserId)} size="sm" variant="ghost">
                Remove
              </Button>
              {chosen && chosen.status !== "approved" && (
                <p className="text-xs text-amber-800 sm:col-span-3">
                  {chosen.name} is {chosen.status}. It will not send until Meta approves it.
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
        <label className="text-xs text-muted-foreground">
          Doctor
          <select
            value={doctorId}
            disabled={busy || available.length === 0}
            onChange={(e) => setDoctorId(e.target.value)}
            className={`${inputClass} mt-1 block w-full`}
          >
            <option value="">{available.length ? "Choose…" : "No one left to add"}</option>
            {available.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.role === "nutritionist" ? " · Nutritionist" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Their template
          <select
            value={templateKey}
            disabled={busy}
            onChange={(e) => setTemplateKey(e.target.value)}
            className={`${inputClass} mt-1 block w-full`}
          >
            <option value="">— choose a template —</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key} disabled={t.needsLinkValue}>
                {templateOption(t)}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          disabled={busy || !doctorId || !templateKey}
          onClick={() => {
            onSave(doctorId, templateKey)
            setDoctorId("")
            setTemplateKey("")
          }} size="sm">
          Add
        </Button>
      </div>
    </div>
  )
}

function Preview({ body, variables, labels }: { body: string; variables: string[]; labels: Record<string, string> }) {
  const parts = body.split(/(\{\{\d+\}\})/g)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\{\{(\d+)\}\}$/)
        if (!m) return <span key={i}>{part}</span>
        const name = variables[Number(m[1]) - 1]
        return (
          <span key={i} className="rounded bg-primary/10 px-1 text-xs font-medium text-primary">
            {name ? (labels[name] ?? name) : part}
          </span>
        )
      })}
    </>
  )
}

function Warning({ children, tone = "amber" }: { children: React.ReactNode; tone?: "amber" | "red" }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
        tone === "red"
          ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
          : "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
      }`}
    >
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

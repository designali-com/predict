"use client"
import { Button } from "@workspace/ui/components/button"

import { useEffect, useState } from "react"
import {
  CONTACT_STAGES,
  CONTACT_ENGAGEMENTS,
  ContactStage,
  ContactEngagement,
} from "@workspace/db/contact-stage"
import { X, Plus, Trash2 } from "lucide-react"
import { DomainEventType } from "@workspace/db/domain-events"
import { NODE_META } from "./node-meta"
import type { CanvasNodeData } from "./automation-node"

interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"
  text: string
}

interface Template {
  id: string
  key: string
  name: string
  ctaButtons?: TemplateButton[]
}

interface NodeConfigPanelProps {
  nodeId: string
  data: CanvasNodeData
  onChange: (config: Record<string, unknown>) => void
  onClose: () => void
}

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"

type SetFn = (p: Record<string, unknown>) => void

export function NodeConfigPanel({ nodeId, data, onChange, onClose }: NodeConfigPanelProps) {
  const kind = data.nodeKind
  const meta = NODE_META[kind]
  const config = data.config ?? {}
  const set: SetFn = (patch) => onChange({ ...config, ...patch })

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{meta.label}</p>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
        <Button onClick={onClose} variant="ghost">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <p className="border-b border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        {meta.details}
      </p>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {kind === "condition" && <ConditionFields config={config} set={set} />}
        {kind === "delay" && <DelayFields config={config} set={set} />}
        {kind === "waitForReply" && <WaitForReplyFields config={config} set={set} />}
        {kind === "waitForEvent" && <WaitForEventFields config={config} set={set} />}
        {kind === "createTask" && <CreateTaskFields config={config} set={set} />}
        {kind === "loadContact" && <LoadContactFields />}
        {kind === "sendCommunication" && <SendCommunicationFields config={config} set={set} />}
        {kind === "databaseUpdate" && <DatabaseUpdateFields config={config} set={set} />}
        {kind === "variable" && <VariableFields config={config} set={set} />}
        {kind === "score" && <ScoreFields config={config} set={set} />}
        {(kind === "apiCall" || kind === "webhook") && <UrlFields config={config} set={set} />}
        {kind === "ai" && <AiFields config={config} set={set} />}
        {kind === "loop" && <LoopFields config={config} set={set} />}
        {kind === "emitEvent" && <EmitEventFields config={config} set={set} />}
        {kind === "sendAvailableDates" && <SendAvailableDatesFields config={config} set={set} />}
        {kind === "sendAvailableTimeSlots" && <SendAvailableTimeSlotsFields config={config} set={set} />}
        {kind === "bookAppointment" && <BookAppointmentFields />}
        {kind === "sendText" && <SendTextFields config={config} set={set} />}
        {kind === "loadVisit" && <LoadVisitFields />}
        {kind === "waitUntilVisit" && <WaitUntilVisitFields config={config} set={set} />}
        {kind === "nurtureStep" && <NurtureStepFields config={config} set={set} />}
        {kind === "trigger" &&
          (data.triggerEventType === "LEAD_STATUS_NEW" || data.triggerEventType === "LEAD_CAPTURED") && (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-2 text-xs leading-relaxed">
              <b>Stops on its own.</b> Before each message, this flow checks the lead is still unreached — status New, No
              answer, Not reachable or Callback later — and that they have not replied or booked since it started. If
              not, the flow ends there; no condition steps are needed for that.
            </p>
          )}
      </div>

      <p className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">Node ID: {nodeId}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

const CONDITION_FIELDS = [
  { path: "contact.leadStatus", label: "Lead status (needs Load Contact before)" },
  { path: "contact.stage", label: "Contact stage (needs Load Contact before)" },
  { path: "contact.city", label: "City (needs Load Contact before)" },
  { path: "contact.source", label: "Lead source (needs Load Contact before)" },
  { path: "doctorUserId", label: "Doctor of the visit (needs Load Visit before)" },
  { path: "lastReplyBody", label: "What they last replied" },
  { path: "lastButtonId", label: "Button they last tapped" },
]

const OPERATORS = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "gt", label: "is more than" },
  { value: "gte", label: "is at least" },
  { value: "lt", label: "is less than" },
  { value: "lte", label: "is at most" },
  { value: "exists", label: "has any value" },
]

/** If … then the "yes" path, otherwise "no". Common fields are offered by name; any other path can be typed. */
function ConditionFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  const field = (config.field as string) ?? ""
  const known = CONDITION_FIELDS.some((f) => f.path === field)
  const [custom, setCustom] = useState(!known && field !== "")
  return (
    <>
      {typeof config.label === "string" && config.label && (
        <p className="rounded-md bg-muted/50 px-2.5 py-2 text-xs">
          <b>Checks:</b> {config.label}
        </p>
      )}
      <Field label="If">
        <select
          value={custom ? "__custom" : field}
          onChange={(e) => {
            if (e.target.value === "__custom") return setCustom(true)
            setCustom(false)
            set({ field: e.target.value })
          }}
          className={inputClass}
        >
          <option value="">Select what to check</option>
          {CONDITION_FIELDS.map((f) => (
            <option key={f.path} value={f.path}>
              {f.label}
            </option>
          ))}
          <option value="__custom">Something else (type a path)…</option>
        </select>
        {custom && (
          <input
            placeholder="e.g. biologicalAge.delta"
            value={field}
            onChange={(e) => set({ field: e.target.value })}
            className={`${inputClass} mt-1.5`}
          />
        )}
      </Field>
      <Field label="Is">
        <select
          value={(config.operator as string) ?? "eq"}
          onChange={(e) => set({ operator: e.target.value })}
          className={inputClass}
        >
          {OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
      </Field>
      {config.operator !== "exists" && (
        <Field label="Value">
          <input
            value={(config.value as string) ?? ""}
            onChange={(e) => set({ value: e.target.value })}
            placeholder={
              field === "contact.leadStatus" ? "e.g. NEW or NOT_REACHABLE" : field === "contact.stage" ? "e.g. LEAD or PATIENT" : ""
            }
            className={inputClass}
          />
        </Field>
      )}
      <p className="text-[11px] text-muted-foreground">Connect the yes / no handles to what should happen next.</p>
    </>
  )
}

function LoadVisitFields() {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      Copies this run&apos;s appointment — its doctor and whether it is still upcoming — into the
      run. Put a Check step after it when only one doctor should continue.
    </p>
  )
}

function WaitUntilVisitFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  return (
    <Field label="When">
      <select
        value={(config.mode as string) ?? ""}
        onChange={(e) => set({ mode: e.target.value })}
        className={inputClass}
      >
        <option value="">Select</option>
        <option value="dayAfterBooking">Day after booking, 10:00</option>
        <option value="between">A day in the gap, 10:00</option>
        <option value="dayBefore">Day before the visit, 10:00</option>
        <option value="morningOf">Morning of the visit, 9:00</option>
      </select>
    </Field>
  )
}

type Slot = { hour: number; minute: number }

const UNITS = [
  { value: "minutes", label: "minutes", ms: 60_000 },
  { value: "hours", label: "hours", ms: 3_600_000 },
  { value: "days", label: "days", ms: 86_400_000 },
] as const

/** The largest unit that divides a duration evenly, so 1440 minutes reads as 1 day. */
function splitDuration(ms: number): { amount: number; unit: (typeof UNITS)[number]["value"] } {
  for (const u of [...UNITS].reverse()) if (ms > 0 && ms % u.ms === 0) return { amount: ms / u.ms, unit: u.value }
  return { amount: Math.round(ms / 60_000), unit: "minutes" }
}

const pad2 = (n: number) => String(n).padStart(2, "0")

/**
 * Wait — either a fixed time ("30 minutes", "2 days"), or until the next of a
 * set of clinic clock times (10:00, 13:30, 18:00, 8:00), which is how a
 * sequence keeps to office hours. Both are editable here.
 */
function DelayFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  const slots: Slot[] = Array.isArray(config.nextSlot)
    ? (config.nextSlot as Slot[]).map((s) => ({ hour: Number(s.hour) || 0, minute: Number(s.minute) || 0 }))
    : []
  const mode = slots.length > 0 ? "slots" : "duration"
  const { amount, unit } = splitDuration(Number(config.durationMs ?? 0))
  const unitMs = UNITS.find((u) => u.value === unit)!.ms

  const setSlots = (next: Slot[]) =>
    set({ nextSlot: [...next].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)) })

  return (
    <>
      <Field label="Wait">
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-0.5 text-xs">
          {[
            { value: "duration", label: "A fixed time" },
            { value: "slots", label: "Until a clock time" },
          ].map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() =>
                m.value === "slots"
                  ? set({ nextSlot: slots.length ? slots : [{ hour: 10, minute: 0 }] })
                  : set({ nextSlot: undefined, durationMs: Number(config.durationMs ?? 0) || 30 * 60_000 })
              }
              className={`rounded px-2 py-1.5 font-medium ${
                mode === m.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Field>

      {mode === "duration" ? (
        <Field label="How long">
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => set({ durationMs: Math.max(0, Number(e.target.value)) * unitMs })}
              className={inputClass}
            />
            <select
              value={unit}
              onChange={(e) => set({ durationMs: amount * UNITS.find((u) => u.value === e.target.value)!.ms })}
              className={inputClass}
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </Field>
      ) : (
        <Field label="Until the next of these times (India time)">
          <div className="space-y-1.5">
            {slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  value={`${pad2(slot.hour)}:${pad2(slot.minute)}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number)
                    if (!Number.isFinite(h) || !Number.isFinite(m)) return
                    setSlots(slots.map((x, j) => (j === i ? { hour: h!, minute: m! } : x)))
                  }}
                  className={inputClass}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove time"
                  disabled={slots.length <= 1}
                  onClick={() => setSlots(slots.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setSlots([...slots, { hour: 18, minute: 0 }])}>
              <Plus className="h-3.5 w-3.5" /> Add a time
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Waits for whichever of these comes next. After the last time of the day it carries on to the first one the
            next morning: with 10:00, 13:30, 18:00 and 8:00, a message sent at 18:00 is followed at 8:00 next day.
          </p>
        </Field>
      )}
    </>
  )
}

function WaitForReplyFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [importFrom, setImportFrom] = useState("")

  useEffect(() => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((d) => setTemplates(d.templates ?? []))
  }, [])

  const replies = Array.isArray(config.expectedReplies)
    ? (config.expectedReplies as { id: string; label: string }[])
    : []
  const timeoutMinutes = config.timeoutMs ? Number(config.timeoutMs) / 60000 : ""

  const updateReply = (i: number, patch: Partial<{ id: string; label: string }>) => {
    const next = replies.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    set({ expectedReplies: next })
  }

  const importFromTemplate = (templateId: string) => {
    setImportFrom(templateId)
    const template = templates.find((t) => t.id === templateId)
    if (!template) return
    const quickReplies = (template.ctaButtons ?? []).filter((b) => b.type === "QUICK_REPLY")
    // WhatsApp's quick-reply webhook echoes the button's visible text back as
    // the payload, so the button's text doubles as both the branch id and label.
    const existingIds = new Set(replies.map((r) => r.id))
    const imported = quickReplies
      .filter((b) => !existingIds.has(b.text))
      .map((b) => ({ id: b.text, label: b.text }))
    if (imported.length > 0) set({ expectedReplies: [...replies, ...imported] })
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Each expected button reply becomes its own branch out of this node — connect them to whatever
        should happen next. Anything else falls into &quot;Any other reply&quot;.
      </p>

      <Field label="Import buttons from a template">
        <select
          value={importFrom}
          onChange={(e) => importFromTemplate(e.target.value)}
          className={inputClass}
        >
          <option value="">Select the template you sent earlier in this flow…</option>
          {templates
            .filter((t) => (t.ctaButtons ?? []).some((b) => b.type === "QUICK_REPLY"))
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Pulls that template&apos;s quick-reply buttons in as branches below, so they match exactly
          what the patient sees on WhatsApp — no retyping button text by hand.
        </p>
      </Field>

      <div className="space-y-2">
        {replies.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              placeholder="button id (e.g. yes)"
              value={r.id}
              onChange={(e) => updateReply(i, { id: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="Label"
              value={r.label}
              onChange={(e) => updateReply(i, { label: e.target.value })}
              className={inputClass}
            />
            <Button
              onClick={() => set({ expectedReplies: replies.filter((_, idx) => idx !== i) })} variant="destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          onClick={() => set({ expectedReplies: [...replies, { id: "", label: "" }] })} size="sm" variant="ghost">
          <Plus className="h-3.5 w-3.5" />
          Add expected reply
        </Button>
      </div>

      <Field label="Timeout (minutes, optional)">
        <input
          type="number"
          min={0}
          placeholder="Wait forever if empty"
          value={timeoutMinutes}
          onChange={(e) =>
            set({ timeoutMs: e.target.value ? Number(e.target.value) * 60000 : undefined })
          }
          className={inputClass}
        />
      </Field>

      <Field label="Save reply value as (optional — for dynamic pickers)">
        <input
          placeholder="e.g. selectedDate, selectedSlot"
          value={(config.captureReplyAs as string) ?? ""}
          onChange={(e) => set({ captureReplyAs: e.target.value || undefined })}
          className={inputClass}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Use this when the reply options aren&apos;t fixed in advance (e.g. a date/time picker sent by
          Send Available Dates) — whatever the contact taps gets saved under this context name instead of
          being matched against fixed branches, and the flow always continues down the single &quot;Any
          other reply&quot; path.
        </p>
      </Field>
    </>
  )
}

/** A nurture message: its template, and when the one after it goes. */
function NurtureStepFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  const slot = Array.isArray(config.nextSlot) ? (config.nextSlot[0] as { hour?: number; minute?: number } | undefined) : undefined
  const value = slot ? `${slot.hour}:${slot.minute ?? 0}` : "10:0"
  return (
    <>
      <SendCommunicationFields config={config} set={set} />
      <Field label="Next message goes at">
        <select
          value={value}
          onChange={(e) => {
            const [hour, minute] = e.target.value.split(":").map(Number)
            set({ nextSlot: [{ hour, minute }] })
          }}
          className={inputClass}
        >
          <option value="10:0">10:00 — morning</option>
          <option value="17:0">17:00 — evening</option>
        </select>
      </Field>
    </>
  )
}

function SendCommunicationFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [icps, setIcps] = useState<{ code: string; name: string }[]>([])

  useEffect(() => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((d) => setTemplates(d.templates ?? []))
    fetch("/api/icps")
      .then((res) => res.json())
      .then((d) => setIcps(d.icps ?? []))
      .catch(() => setIcps([]))
  }, [])

  // A set of templates named <prefix>_general, <prefix>_knee_pain, ... is
  // offered once more as "<prefix>_{interest}": the send step then picks the
  // one matching the lead's interest (Setup -> Lead routing), falling back to
  // _general. See nodes/send-communication.ts.
  const families = templates
    .filter((t) => t.key.endsWith("_general"))
    .map((t) => {
      const prefix = t.key.slice(0, -"_general".length)
      const variants = templates.filter((v) => v.key.startsWith(`${prefix}_`)).length
      return { key: `${prefix}_{interest}`, prefix, variants }
    })
  const current = (config.templateKey as string) ?? ""

  return (
    <>
      <Field label="Template">
        <select
          value={current}
          onChange={(e) => set({ templateKey: e.target.value })}
          className={inputClass}
        >
          <option value="">Select template</option>
          {families.length > 0 && (
            <optgroup label="Matched to the lead's interest">
              {families.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.prefix}_… ({f.variants} versions)
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="One template">
            {templates.map((t) => (
              <option key={t.id} value={t.key}>
                {t.name}
              </option>
            ))}
          </optgroup>
        </select>
        {current.includes("{interest}") ? (
          <>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Each lead gets the version for its ICP ({current.replace("{interest}", "<icp code>")}); a lead
              with no ICP, or an ICP with no version yet, gets {current.replace("{interest}", "general")}.
            </p>
            {(() => {
              const missing = icps.filter(
                (i) => !templates.some((t) => t.key === current.replace("{interest}", i.code)),
              )
              return missing.length > 0 ? (
                <p className="mt-1 text-[11px] text-amber-700">
                  No version yet for: {missing.map((i) => i.name).join(", ")} — they get the general one.
                </p>
              ) : icps.length > 0 ? (
                <p className="mt-1 text-[11px] text-emerald-700">Every ICP has its own version.</p>
              ) : null
            })()}
          </>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            For one message per ICP, name templates &lt;step&gt;_general plus &lt;step&gt;_&lt;icp code&gt;
            (lead_day1_general, lead_day1_knee_pain …) — they then appear above as one choice.
          </p>
        )}
      </Field>
      <Field label="Channel">
        <select
          value={(config.channel as string) ?? "whatsapp"}
          onChange={(e) => set({ channel: e.target.value })}
          className={inputClass}
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
        </select>
      </Field>
      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 text-xs">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={config.ignoreQuietHours !== true}
          onChange={(e) => set({ ignoreQuietHours: !e.target.checked })}
        />
        <span>
          <b>Respect quiet hours</b>
          <span className="block text-[11px] text-muted-foreground">
            Not sent at night (the hours set under Settings); it waits for the morning instead.
          </span>
        </span>
      </label>
    </>
  )
}

function DatabaseUpdateFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  const operation = (config.operation as string) ?? "setContactStage"

  return (
    <>
      <Field label="Operation (allow-listed only)">
        <select value={operation} onChange={(e) => set({ operation: e.target.value })} className={inputClass}>
          <option value="setContactStage">Set contact stage</option>
          <option value="setContactEngagement">Set contact engagement</option>
          <option value="logAdherenceEntry">Log adherence entry (medication/exercise/diet)</option>
        </select>
      </Field>
      <Field label="Contact ID path (default: contactId)">
        <input
          value={(config.contactIdFromContext as string) ?? "contactId"}
          onChange={(e) => set({ contactIdFromContext: e.target.value })}
          className={inputClass}
        />
      </Field>

      {/* Both are pick-lists rather than free text: a typo used to be written
          straight into the column, and every downstream stage == "LEAD"
          check would quietly stop matching that contact. */}
      {operation === "setContactStage" && (
        <Field label="New stage">
          <select
            value={(config.stage as string) ?? ContactStage.LEAD}
            onChange={(e) => set({ stage: e.target.value })}
            className={inputClass}
          >
            {CONTACT_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </Field>
      )}

      {operation === "setContactEngagement" && (
        <Field label="New engagement">
          <select
            value={(config.engagement as string) ?? ContactEngagement.LONG_TERM}
            onChange={(e) => set({ engagement: e.target.value })}
            className={inputClass}
          >
            {CONTACT_ENGAGEMENTS.map((engagement) => (
              <option key={engagement} value={engagement}>
                {engagement}
              </option>
            ))}
          </select>
        </Field>
      )}

      {operation === "logAdherenceEntry" && (
        <>
          <Field label="Log type">
            <select
              value={(config.logType as string) ?? "medication"}
              onChange={(e) => set({ logType: e.target.value })}
              className={inputClass}
            >
              <option value="medication">Medication</option>
              <option value="exercise">Exercise</option>
              <option value="diet">Diet</option>
            </select>
          </Field>
          <Field label="Status (usually from the reply button context)">
            <input
              placeholder="e.g. done, missed — or {{lastButtonId}} from a Wait for Reply above"
              value={(config.status as string) ?? ""}
              onChange={(e) => set({ status: e.target.value })}
              className={inputClass}
            />
          </Field>
        </>
      )}
    </>
  )
}

function WaitForEventFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  const timeoutMinutes = config.timeoutMs ? Number(config.timeoutMs) / 60000 : ""

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Suspends until this exact event happens for this contact — e.g. wait for an appointment to get
        booked. Connect the &quot;Event happened&quot; dot to what should happen next, and (if you set a
        timeout) the &quot;Timed out&quot; dot to the fallback path.
      </p>
      <Field label="Wait for event">
        <select
          value={(config.eventType as string) ?? ""}
          onChange={(e) => set({ eventType: e.target.value })}
          className={inputClass}
        >
          <option value="">Select event</option>
          {Object.values(DomainEventType).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Timeout (minutes, optional)">
        <input
          type="number"
          min={0}
          placeholder="Wait forever if empty"
          value={timeoutMinutes}
          onChange={(e) =>
            set({ timeoutMs: e.target.value ? Number(e.target.value) * 60000 : undefined })
          }
          className={inputClass}
        />
      </Field>
    </>
  )
}

function CreateTaskFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  const dueInMinutes = config.dueInMs ? Number(config.dueInMs) / 60000 : ""

  return (
    <>
      <Field label="Task title">
        <input
          placeholder="e.g. Health Coach direct call"
          value={(config.title as string) ?? ""}
          onChange={(e) => set({ title: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Assign to">
        <select
          value={(config.assignedRole as string) ?? "health_coach"}
          onChange={(e) => set({ assignedRole: e.target.value })}
          className={inputClass}
        >
          <option value="health_coach">Health Coach</option>
          <option value="doctor">Doctor</option>
          <option value="admin">Admin</option>
        </select>
      </Field>
      <Field label="Due in (minutes from now, optional)">
        <input
          type="number"
          min={0}
          value={dueInMinutes}
          onChange={(e) => set({ dueInMs: e.target.value ? Number(e.target.value) * 60000 : undefined })}
          className={inputClass}
        />
      </Field>
    </>
  )
}

function LoadContactFields() {
  return <p className="text-xs text-muted-foreground">No settings — see the explanation above.</p>
}

function VariableFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  return (
    <>
      <Field label="Variable name">
        <input
          value={(config.outputKey as string) ?? ""}
          onChange={(e) => set({ outputKey: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Value">
        <input
          value={(config.value as string) ?? ""}
          onChange={(e) => set({ value: e.target.value })}
          className={inputClass}
        />
      </Field>
    </>
  )
}

function ScoreFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  return (
    <>
      <Field label="Field to read">
        <input
          value={(config.field as string) ?? ""}
          onChange={(e) => set({ field: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Save score as">
        <input
          value={(config.outputKey as string) ?? ""}
          onChange={(e) => set({ outputKey: e.target.value })}
          className={inputClass}
        />
      </Field>
    </>
  )
}

function UrlFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  return (
    <Field label="URL">
      <input
        placeholder="https://..."
        value={(config.url as string) ?? ""}
        onChange={(e) => set({ url: e.target.value })}
        className={inputClass}
      />
    </Field>
  )
}

function AiFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  const mode = (config.mode as string) ?? "answer"
  const choices = (config.choices as { id: string; label: string }[] | undefined) ?? []

  const setChoice = (i: number, patch: Partial<{ id: string; label: string }>) =>
    set({ choices: choices.map((c, index) => (index === i ? { ...c, ...patch } : c)) })

  return (
    <>
      <Field label="What this step does">
        <select value={mode} onChange={(e) => set({ mode: e.target.value })} className={inputClass}>
          <option value="answer">Answer them on WhatsApp</option>
          <option value="classify">Sort their reply into branches</option>
          <option value="write">Write text for a later step</option>
        </select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          The clinic&apos;s facts, tone and safety rules come from Setup → AI replies. What you write below is
          the instruction for this one step — it cannot change what the assistant is allowed to claim.
        </p>
      </Field>

      <Field label={mode === "classify" ? "How to decide" : "Instruction for this step"}>
        <textarea
          rows={3}
          value={(config.prompt as string) ?? ""}
          onChange={(e) => set({ prompt: e.target.value })}
          placeholder={
            mode === "answer"
              ? "e.g. Answer their question and offer an assessment slot this week."
              : mode === "classify"
                ? "e.g. Decide whether they are saying yes to a call, saying no, or asking something else."
                : "e.g. Write a one-line summary of this conversation for the caller."
          }
          className={inputClass}
        />
      </Field>

      {mode === "classify" && (
        <Field label="Branches">
          <div className="space-y-1.5">
            {choices.map((choice, i) => (
              <div key={i} className="flex gap-1.5">
                <input
                  value={choice.id ?? ""}
                  onChange={(e) => setChoice(i, { id: e.target.value })}
                  placeholder="id, e.g. yes"
                  className={`${inputClass} w-28`}
                />
                <input
                  value={choice.label ?? ""}
                  onChange={(e) => setChoice(i, { label: e.target.value })}
                  placeholder="what it means, e.g. wants a call"
                  className={inputClass}
                />
                <Button
                  type="button"
                  onClick={() => set({ choices: choices.filter((_, index) => index !== i) })} size="sm" variant="outline">
                  ×
                </Button>
              </div>
            ))}
            <Button
              type="button"
              onClick={() => set({ choices: [...choices, { id: "", label: "" }] })} size="sm" variant="outline">
              Add branch
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A reply that fits none of them takes the &quot;Not clear&quot; branch — send that one to a task or a
            person, never nowhere.
          </p>
        </Field>
      )}

      <Field label="Message to read (context path)">
        <input
          value={(config.inputFrom as string) ?? ""}
          onChange={(e) => set({ inputFrom: e.target.value || undefined })}
          placeholder="lastReplyBody"
          className={inputClass}
        />
      </Field>

      {mode !== "answer" && (
        <Field label="Save the result as">
          <input
            value={(config.outputKey as string) ?? ""}
            onChange={(e) => set({ outputKey: e.target.value || undefined })}
            placeholder={mode === "write" ? "aiText" : "aiChoice"}
            className={inputClass}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {mode === "write"
              ? "A later Send Text node can use this, e.g. {{aiText}}."
              : "The branch it picked, for a later Condition node."}
          </p>
        </Field>
      )}
    </>
  )
}

function LoopFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  return (
    <>
      <Field label="Items path in context">
        <input
          value={(config.itemsFromContext as string) ?? ""}
          onChange={(e) => set({ itemsFromContext: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Save as">
        <input
          value={(config.outputKey as string) ?? ""}
          onChange={(e) => set({ outputKey: e.target.value })}
          className={inputClass}
        />
      </Field>
    </>
  )
}

function EmitEventFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  return (
    <Field label="Event to emit">
      <select
        value={(config.eventType as string) ?? ""}
        onChange={(e) => set({ eventType: e.target.value })}
        className={inputClass}
      >
        <option value="">Select event</option>
        {Object.values(DomainEventType).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </Field>
  )
}

interface Doctor {
  id: string
  name: string
}

function useDoctors(): Doctor[] {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  useEffect(() => {
    fetch("/api/staff/doctors")
      .then((res) => res.json())
      .then((d) => setDoctors(d.doctors ?? []))
  }, [])
  return doctors
}

function SendAvailableDatesFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  const doctors = useDoctors()
  return (
    <>
      <Field label="Doctor">
        <select
          value={(config.doctorUserId as string) ?? ""}
          onChange={(e) => set({ doctorUserId: e.target.value })}
          className={inputClass}
        >
          <option value="">Select doctor</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Set up this doctor&apos;s weekly slots and capacity on the Availability page first.
          With the split on, this doctor is only the fallback.
        </p>
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={config.balanceRole === "nutritionist"}
          onChange={(e) => set({ balanceRole: e.target.checked ? "nutritionist" : undefined })}
        />
        <span>
          Split new bookings across nutritionists
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Each booking goes to whichever nutritionist has fewer upcoming visits, so two of them share the book evenly. Only someone with an open day is chosen.
          </span>
        </span>
      </label>
      <Field label="How many days ahead to look (default 14)">
        <input
          type="number"
          min={1}
          placeholder="14"
          value={(config.daysAhead as number) ?? ""}
          onChange={(e) => set({ daysAhead: e.target.value ? Number(e.target.value) : undefined })}
          className={inputClass}
        />
      </Field>
      <Field label="Max dates to offer (default 5)">
        <input
          type="number"
          min={1}
          placeholder="5"
          value={(config.maxDates as number) ?? ""}
          onChange={(e) => set({ maxDates: e.target.value ? Number(e.target.value) : undefined })}
          className={inputClass}
        />
      </Field>
      <Field label="Message text">
        <input
          placeholder="Please pick a date for your appointment:"
          value={(config.bodyText as string) ?? ""}
          onChange={(e) => set({ bodyText: e.target.value })}
          className={inputClass}
        />
      </Field>
    </>
  )
}

function SendAvailableTimeSlotsFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  return (
    <>
      <p className="text-xs text-muted-foreground">
        Reads the doctor and date from context automatically (set earlier by Send Available Dates and the
        Wait for Reply right before this node) — nothing to pick here unless you used different context
        names.
      </p>
      <Field label="Message text">
        <input
          placeholder="Please pick a time:"
          value={(config.bodyText as string) ?? ""}
          onChange={(e) => set({ bodyText: e.target.value })}
          className={inputClass}
        />
      </Field>
    </>
  )
}

function BookAppointmentFields() {
  return (
    <p className="text-xs text-muted-foreground">
      No settings — see the explanation above. Reads contact.stage only for the LEAD → PATIENT flip;
      everything else it needs (date, slot, doctor) comes from context automatically.
    </p>
  )
}

function SendTextFields({ config, set }: { config: Record<string, unknown>; set: SetFn }) {
  return (
    <Field label="Message text">
      <textarea
        rows={4}
        placeholder="Your appointment is confirmed for {{selectedDate}}, {{selectedSlot}}."
        value={(config.bodyText as string) ?? ""}
        onChange={(e) => set({ bodyText: e.target.value })}
        className={inputClass}
      />
    </Field>
  )
}

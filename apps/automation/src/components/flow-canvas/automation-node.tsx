"use client"
import { Button } from "@workspace/ui/components/button"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Trash2 } from "lucide-react"
import { NODE_META, type NodeKind } from "./node-meta"

export interface CanvasNodeData {
  nodeKind: NodeKind
  config: Record<string, unknown>
  triggerEventType?: string
  onDelete?: (id: string) => void
  [key: string]: unknown
}

function summarize(kind: NodeKind, data: CanvasNodeData): string | null {
  const config = data.config ?? {}
  switch (kind) {
    case "trigger":
      return data.triggerEventType ? `WHEN ${data.triggerEventType}` : "Select a trigger event"
    case "condition":
      return typeof config.label === "string" && config.label
        ? config.label
        : config.field
          ? `${config.field} ${OPERATOR_WORDS[String(config.operator ?? "eq")] ?? config.operator} ${config.value ?? ""}`
          : null
    case "delay":
      return Array.isArray(config.nextSlot)
        ? `Next of ${slotList(config.nextSlot)}`
        : config.durationMs
          ? `Wait ${waitText(Number(config.durationMs))}`
          : null
    case "waitForReply": {
      const replies = Array.isArray(config.expectedReplies) ? config.expectedReplies : []
      return replies.length > 0
        ? `${replies.length} expected repl${replies.length === 1 ? "y" : "ies"}`
        : "Any reply"
    }
    case "waitForEvent":
      return config.eventType ? `Until ${config.eventType}` : "Select an event to wait for"
    case "createTask":
      return typeof config.title === "string" && config.title ? config.title : null
    case "loadContact":
      return "Refreshes contact.stage, etc. from the database"
    case "sendCommunication":
      return typeof config.templateKey === "string" && config.templateKey
        ? `Template: ${config.templateKey}`
        : null
    case "databaseUpdate":
      return typeof config.status === "string" && config.status ? `Set status → ${config.status}` : null
    case "variable":
      return typeof config.outputKey === "string" && config.outputKey ? `${config.outputKey} = ...` : null
    case "emitEvent":
      return typeof config.eventType === "string" && config.eventType ? `Emit ${config.eventType}` : null
    case "sendText":
      return typeof config.bodyText === "string" && config.bodyText ? config.bodyText.slice(0, 40) : null
    case "loadVisit":
      return "Doctor and status from the booked visit"
    case "nurtureStep": {
      const key = typeof config.templateKey === "string" && config.templateKey ? config.templateKey : "Pick a template"
      const slot = Array.isArray(config.nextSlot) ? (config.nextSlot[0] as { hour?: number } | undefined) : undefined
      const when = slot?.hour == null ? "" : slot.hour < 12 ? " · next: morning" : " · next: evening"
      return `${key}${when}`
    }
    case "waitUntilVisit":
      return typeof config.mode === "string" ? visitWaitLabel(config.mode) : "Pick when to send"
    case "sendAvailableDates":
    case "sendAvailableTimeSlots":
    case "bookAppointment":
      return null
    default:
      return null
  }
}

function AutomationNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData
  const kind = nodeData.nodeKind
  const meta = NODE_META[kind]
  const Icon = meta.icon
  const summary = summarize(kind, nodeData)

  return (
    <div
      className={`w-56 rounded-lg border-2 bg-card shadow-sm transition ${
        selected ? "border-black" : "border-border"
      }`}
    >
      {kind !== "trigger" && (
        <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !bg-card" />
      )}

      <div
        className="flex items-center gap-2 rounded-t-md px-3 py-2 text-primary-foreground"
        style={{ backgroundColor: meta.color }}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-xs font-semibold uppercase tracking-wide">{meta.label}</span>
        {kind !== "trigger" && nodeData.onDelete && (
          <Button
            onClick={(e) => {
              e.stopPropagation()
              nodeData.onDelete?.(id)
            }}
            size="icon-xs"
            variant="ghost"
            className="ml-auto text-primary-foreground hover:bg-white/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="px-3 py-2">
        <p className="truncate text-xs text-muted-foreground">{summary ?? meta.description}</p>
      </div>

      {kind === "condition" && <TwoBranchHandles trueLabel="Yes" falseLabel="No" trueId="true" falseId="false" />}
      {kind === "waitUntilVisit" && <TwoBranchHandles trueLabel="Send" falseLabel="Skip" trueId="due" falseId="skip" />}
      {(kind === "sendAvailableDates" || kind === "sendAvailableTimeSlots") && (
        <TwoBranchHandles trueLabel="Available" falseLabel="No availability" trueId="available" falseId="empty" />
      )}
      {kind === "bookAppointment" && (
        <TwoBranchHandles trueLabel="Booked" falseLabel="Full" trueId="booked" falseId="full" />
      )}

      {kind === "ai" && <AiHandles config={nodeData.config} />}
      {kind === "waitForReply" && <WaitForReplyHandles config={nodeData.config} />}
      {kind === "waitForEvent" && <WaitForEventHandles config={nodeData.config} />}

      {!(kind === "ai" && (nodeData.config?.mode ?? "answer") !== "write") &&
        kind !== "condition" &&
        kind !== "waitForReply" &&
        kind !== "waitForEvent" &&
        kind !== "sendAvailableDates" &&
        kind !== "sendAvailableTimeSlots" &&
        kind !== "bookAppointment" &&
        kind !== "waitUntilVisit" && (
          <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !bg-card" />
        )}
    </div>
  )
}

function slotList(slots: unknown): string {
  if (!Array.isArray(slots)) return ""
  return slots
    .map((slot) => {
      const hour = Number((slot as { hour?: number }).hour)
      const minute = Number((slot as { minute?: number }).minute ?? 0)
      if (!Number.isFinite(hour)) return ""
      const hour12 = hour % 12 || 12
      const mins = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`
      return `${hour12}${mins}${hour < 12 ? "am" : "pm"}`
    })
    .filter(Boolean)
    .join(", ")
}

function visitWaitLabel(mode: string): string {
  switch (mode) {
    case "dayAfterBooking":
      return "Day after booking, 10:00"
    case "between":
      return "A day in the gap, 10:00"
    case "dayBefore":
      return "Day before the visit, 10:00"
    case "morningOf":
      return "Morning of the visit, 9:00"
    default:
      return mode
  }
}

function TwoBranchHandles({
  trueLabel,
  falseLabel,
  trueId,
  falseId,
}: {
  trueLabel: string
  falseLabel: string
  trueId: string
  falseId: string
}) {
  return (
    <>
      <div className="flex justify-between border-t border-border px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
        <span>{trueLabel}</span>
        <span>{falseLabel}</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id={trueId}
        style={{ left: "25%" }}
        className="!h-3 !w-3 !border-2 !bg-green-500"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id={falseId}
        style={{ left: "75%" }}
        className="!h-3 !w-3 !border-2 !bg-red-500"
      />
    </>
  )
}

/**
 * An AI step branches by what it did: answered them, or could not and passed
 * it to a person; or, when classifying, one handle per option it may pick
 * plus "unclear" — which is never a dead end, it is where a human takes over.
 */
function AiHandles({ config }: { config: Record<string, unknown> }) {
  const mode = (config?.mode as string) ?? "answer"
  if (mode === "write") return null
  const rows =
    mode === "classify"
      ? [
          ...((config?.choices as { id: string; label: string }[] | undefined) ?? [])
            .filter((c) => c?.id)
            .map((c) => ({ id: c.id, label: c.label || c.id, color: "#16a34a" })),
          { id: "unclear", label: "Not clear", color: "#dc2626" },
        ]
      : [
          { id: "answered", label: "Answered", color: "#16a34a" },
          { id: "handoff", label: "Needs a person", color: "#dc2626" },
        ]

  return (
    <div className="divide-y divide-border border-t border-border">
      {rows.map((row) => (
        <div key={row.id} className="relative flex items-center justify-between px-3 py-1.5">
          <span className="truncate text-[10px] font-medium text-muted-foreground">{row.label}</span>
          <Handle
            type="source"
            position={Position.Right}
            id={row.id}
            style={{ top: "50%", background: row.color }}
            className="!h-2.5 !w-2.5 !border-2"
          />
        </div>
      ))}
    </div>
  )
}

function WaitForReplyHandles({ config }: { config: Record<string, unknown> }) {
  const replies = Array.isArray(config.expectedReplies)
    ? (config.expectedReplies as { id: string; label: string }[])
    : []
  const rows = [
    ...replies.map((r) => ({ id: r.id, label: r.label, color: "#16a34a" })),
    { id: "any_reply", label: "Any other reply", color: "#2563eb" },
    ...(config.timeoutMs ? [{ id: "timeout", label: "No reply (timeout)", color: "#dc2626" }] : []),
  ]

  return (
    <div className="divide-y divide-border border-t border-border">
      {rows.map((row) => (
        <div key={row.id} className="relative flex items-center justify-between px-3 py-1.5">
          <span className="truncate text-[10px] font-medium text-muted-foreground">{row.label}</span>
          <Handle
            type="source"
            position={Position.Right}
            id={row.id}
            style={{ top: "50%", background: row.color }}
            className="!h-2.5 !w-2.5 !border-2"
          />
        </div>
      ))}
    </div>
  )
}

function WaitForEventHandles({ config }: { config: Record<string, unknown> }) {
  const rows = [
    { id: "event", label: "Event happened", color: "#16a34a" },
    ...(config.timeoutMs ? [{ id: "timeout", label: "Timed out", color: "#dc2626" }] : []),
  ]

  return (
    <div className="divide-y divide-border border-t border-border">
      {rows.map((row) => (
        <div key={row.id} className="relative flex items-center justify-between px-3 py-1.5">
          <span className="truncate text-[10px] font-medium text-muted-foreground">{row.label}</span>
          <Handle
            type="source"
            position={Position.Right}
            id={row.id}
            style={{ top: "50%", background: row.color }}
            className="!h-2.5 !w-2.5 !border-2"
          />
        </div>
      ))}
    </div>
  )
}

export const AutomationNode = memo(AutomationNodeComponent)

const OPERATOR_WORDS: Record<string, string> = {
  eq: "is",
  neq: "is not",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  exists: "has a value",
}

/** "30 min", "2 h", "1 day" — the biggest unit that fits evenly. */
function waitText(ms: number): string {
  if (ms % 86_400_000 === 0) return `${ms / 86_400_000} day${ms === 86_400_000 ? "" : "s"}`
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000} h`
  return `${Math.round(ms / 60_000)} min`
}

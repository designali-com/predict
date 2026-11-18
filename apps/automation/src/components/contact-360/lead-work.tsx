"use client"

import { useEffect, useState } from "react"
import { PhoneCall, PhoneMissed, UserRound } from "lucide-react"
import { CONNECTED_OUTCOMES, NOT_CONNECTED_OUTCOMES, leadStatusMeta } from "@workspace/db/lead-status"
import { toast } from "@workspace/ui/components/sonner"
import { Button } from "@workspace/ui/components/button"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Props {
  contactId: string
  leadStatus: string | null
  leadStatusAt: string | null
  callbackAt: string | null
  interest: string | null
  city: string | null
  assignedUserId: string | null
  assignedUserName: string | null
  assignedRole: string | null
  canReassign: boolean
  onChanged: () => void
}

interface Person {
  id: string
  name: string
  role: string | null
}

const inputClass =
  "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground"

/**
 * Where the picker starts: the lead's own call outcome, or nothing when the
 * current status is New or came from the appointment (booked, missed…), which
 * is not something a caller picks.
 */
function initialOutcome(leadStatus: string | null) {
  return leadStatusMeta(leadStatus)?.call ? leadStatus! : ""
}

const QUICK_TIMES = [
  { label: "In 2 hours", at: () => new Date(Date.now() + 2 * 3_600_000) },
  {
    label: "Tomorrow 11 am",
    at: () => {
      const d = new Date(Date.now() + 86_400_000)
      d.setHours(11, 0, 0, 0)
      return d
    },
  },
]

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * The caller's panel: mark what happened on this attempt, and see or change
 * who owns the lead and what it is about. Each status change can start its
 * own flow (trigger LEAD_STATUS_<status>), so marking "No answer" is what
 * sends the "we tried to reach you" WhatsApp.
 */
export function LeadWork(props: Props) {
  const [status, setStatus] = useState(initialOutcome(props.leadStatus))
  const [connected, setConnected] = useState(leadStatusMeta(props.leadStatus)?.call ?? null)
  const [note, setNote] = useState("")
  const [callbackAt, setCallbackAt] = useState(
    props.callbackAt ? toLocalInput(new Date(props.callbackAt)) : toLocalInput(new Date(Date.now() + 86_400_000)),
  )
  // "Try again at" on a call that did not connect: optional, so it starts empty.
  const [retryAt, setRetryAt] = useState("")
  const [interest, setInterest] = useState(props.interest ?? "")
  const [people, setPeople] = useState<Person[]>([])
  const [icps, setIcps] = useState<{ code: string; name: string }[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setStatus(initialOutcome(props.leadStatus))
    setConnected(leadStatusMeta(props.leadStatus)?.call ?? null)
    setInterest(props.interest ?? "")
  }, [props.leadStatus, props.interest])

  useEffect(() => {
    fetch("/api/icps")
      .then((r) => r.json())
      .then((d) => setIcps(d.icps ?? []))
      .catch(() => setIcps([]))
  }, [])

  useEffect(() => {
    if (!props.canReassign) return
    fetch("/api/staff/assignable")
      .then((r) => r.json())
      .then((d) => setPeople(d.people ?? []))
      .catch(() => setPeople([]))
  }, [props.canReassign])

  async function send(what: string, url: string, body: unknown) {
    setBusy(what)
    setError(null)
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? "Could not save")
      if (what === "status") {
        setNote("")
        setRetryAt("")
      }
      toast.success(
        what === "status" ? "Lead status saved" : what === "assign" ? "Lead reassigned" : "Interest saved",
      )
      props.onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save")
      toast.error(e instanceof Error ? e.message : "Could not save")
    } finally {
      setBusy(null)
    }
  }

  const current = leadStatusMeta(props.leadStatus)
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
  const picked = leadStatusMeta(status)
  const options = connected === "connected" ? CONNECTED_OUTCOMES : connected === "not_connected" ? NOT_CONNECTED_OUTCOMES : []
  // The time box: a promised callback must have one; a call that did not
  // connect may have one ("try again at"), or be left to the call queue.
  const when = picked?.time === "required" ? callbackAt : retryAt
  const canSave = !!picked?.call && (picked.time !== "required" || !!callbackAt)

  const chooseSide = (side: "connected" | "not_connected") => {
    setConnected(side)
    // Keep the outcome only if it belongs to the side just chosen.
    if (leadStatusMeta(status)?.call !== side) setStatus("")
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <PhoneCall className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Lead work</h2>
        {current && <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${current.tone}`}>{current.label}</span>}
        {current?.auto && <span className="text-[11px] text-muted-foreground">from the appointment</span>}
      </div>
      {(props.leadStatusAt || props.callbackAt) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {props.leadStatusAt && `since ${fmt(props.leadStatusAt)}`}
          {props.callbackAt && current?.time && (
            <span className="text-violet-600 dark:text-violet-400">
              {" "}
              · {current.time === "required" ? "call back" : "try again"} {fmt(props.callbackAt)}
            </span>
          )}
        </p>
      )}

      {/* First: did the call connect? Then only the outcomes that fit that
          answer. Not interested, out of area, wrong number, duplicate and lost
          also close the lead (stage Lost). */}
      <div className="mt-3 space-y-3">
        <div>
          <p className={labelClass}>How did the call go?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() => chooseSide("connected")} size="sm" variant="outline">
              <PhoneCall className="h-4 w-4" /> Connected
            </Button>
            <Button
              type="button"
              onClick={() => chooseSide("not_connected")} size="sm" variant="outline">
              <PhoneMissed className="h-4 w-4" /> Not connected
            </Button>
          </div>
        </div>

        {options.length > 0 && (
          <div>
            <p className={labelClass}>{connected === "connected" ? "What did they say?" : "What happened?"}</p>
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <Button
                  key={o.key}
                  type="button"
                  onClick={() => setStatus(o.key)} size="sm" variant={status === o.key ? "default" : "outline"}>
                  {o.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {picked?.time && (
          <div className="space-y-1.5 rounded-md bg-muted/40 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {picked.time === "required" ? (
                  "Call back at"
                ) : (
                  <>
                    Try again at <span className="font-normal">(optional)</span>
                  </>
                )}
              </span>
              {picked.time === "optional" && retryAt && (
                <Button type="button" onClick={() => setRetryAt("")} size="sm" variant="ghost" className="text-primary">
                  Clear
                </Button>
              )}
            </div>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => (picked.time === "required" ? setCallbackAt : setRetryAt)(e.target.value)}
              className={`${inputClass} w-full`}
            />
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TIMES.map((q) => (
                <Button
                  key={q.label}
                  type="button"
                  onClick={() => (picked.time === "required" ? setCallbackAt : setRetryAt)(toLocalInput(q.at()))} size="sm" variant="outline">
                  {q.label}
                </Button>
              ))}
            </div>
            {picked.time === "optional" && !retryAt && (
              <p className="text-[11px] text-muted-foreground">Left empty, the call queue offers a retry in a few hours.</p>
            )}
          </div>
        )}

        {picked?.call && (
          <>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Note (optional)"
              className={`${inputClass} w-full resize-none`}
            />
            <Button
              size="sm"
              className="w-full"
              onClick={() =>
                send("status", `/api/contacts/${props.contactId}/lead-status`, {
                  status,
                  note,
                  callbackAt: picked.time && when ? new Date(when).toISOString() : null,
                })
              }
              disabled={busy !== null || !canSave}
            >
              {busy === "status" && <PredictSpinner className="size-4" />}
              Save outcome
            </Button>
          </>
        )}
      </div>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div>
          <label className={labelClass}>Owner</label>
          {props.canReassign ? (
            <select
              value={props.assignedUserId ?? ""}
              onChange={(e) => send("assign", `/api/contacts/${props.contactId}/assign`, { userId: e.target.value || null })}
              disabled={busy !== null}
              className={`${inputClass} w-full`}
            >
              <option value="">{props.assignedRole ? `Unclaimed — ${props.assignedRole} pool` : "Unassigned"}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.role ? `· ${p.role}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <p className="flex items-center gap-1.5 text-sm">
              <UserRound className="h-4 w-4 text-muted-foreground" />
              {props.assignedUserName ?? (props.assignedRole ? `${props.assignedRole} pool` : "Unassigned")}
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>Interest (ICP)</label>
          <div className="flex gap-2">
            <select value={interest} onChange={(e) => setInterest(e.target.value)} className={`${inputClass} min-w-0 flex-1`}>
              <option value="">None — general messages</option>
              {icps.map((i) => (
                <option key={i.code} value={i.code}>
                  {i.name}
                </option>
              ))}
              {interest && !icps.some((i) => i.code === interest) && <option value={interest}>{interest}</option>}
            </select>
            {interest !== (props.interest ?? "") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => send("interest", `/api/contacts/${props.contactId}/interest`, { interest })}
                disabled={busy !== null}
              >
                Save
              </Button>
            )}
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  )
}

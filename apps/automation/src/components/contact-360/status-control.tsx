"use client"
import { Button } from "@workspace/ui/components/button"

import { useState } from "react"
import { Check, Ban, MoonStar, RotateCcw, Flame } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Props {
  contactId: string
  stage: string
  engagement: string | null
  onChanged: () => void | Promise<void>
}

/**
 * Stage and follow-up: what only a person can decide about someone.
 *
 * Most of the lifecycle moves on its own — booking, attending, a no-show — but
 * the two outcomes a person learns by actually talking to someone never did:
 * "not interested" and "stop messaging me". There was nowhere to put either,
 * so they lived in someone's memory and the automation carried on regardless.
 *
 * BOOKED and PATIENT are absent on purpose: both are earned by an appointment
 * row, and the funnel derives its Booked/Attended columns from those rows. A
 * hand-set BOOKED would put someone in that column with nothing booked. The
 * API refuses them too — this is not the only guard.
 */
const STAGE_ACTIONS = [
  {
    stage: "LOST",
    label: "Not interested",
    icon: Ban,
    tone: "text-red-600 hover:border-red-300",
    note: "Marks them Lost. No automation will pick them up again unless someone puts them back.",
  },
  {
    stage: "INACTIVE",
    label: "Gone quiet",
    icon: MoonStar,
    tone: "text-amber-700 hover:border-amber-300",
    note: "Marks them Inactive — was a patient, stopped coming.",
  },
  {
    stage: "LEAD",
    label: "Back in play",
    icon: RotateCcw,
    tone: "text-blue-600 hover:border-blue-300",
    note: "Puts them back to Lead so nurture and follow-ups can reach them again.",
  },
]

const ENGAGEMENT_ACTIONS = [
  {
    engagement: "ACTIVE",
    label: "Working on it",
    icon: Flame,
    note: "Someone is actively chasing this person right now.",
  },
  {
    engagement: "LONG_TERM",
    label: "Slow burn",
    icon: MoonStar,
    note: "Keep in touch occasionally — nurture ran its course without converting.",
  },
  {
    engagement: "DO_NOT_CONTACT",
    label: "Do not contact",
    icon: Ban,
    note: "Switches off marketing and reminder consent as well, so sends actually stop. Transactional messages about something they asked for still go out.",
  },
]

export function StatusControl({ contactId, stage, engagement, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const patch = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? "Could not update")
        toast.error(data?.error ?? "Could not update")
        return
      }
      toast.success("stage" in body ? "Stage updated" : "Engagement updated")
      await onChanged()
    } finally {
      setBusy(null)
    }
  }

  // For a lead, "Not interested" is one of the outcomes in Lead work, which
  // also moves them to Lost — so it is not offered here a second time.
  const stageActions = STAGE_ACTIONS.filter(
    (a) =>
      a.stage !== stage &&
      !(a.stage === "LOST" && stage === "LEAD") &&
      // "Gone quiet" is for a patient who stopped coming.
      !(a.stage === "INACTIVE" && stage !== "PATIENT"),
  )

  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold">Stage &amp; follow-up</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
        Booking and visits move the stage on their own. These are for what only a person knows.
      </p>

      {stageActions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {stageActions.map((a) => (
            <Button
              key={a.stage}
              onClick={() => patch(a.stage, { stage: a.stage })}
              disabled={busy !== null}
              title={a.note} size="sm" variant="outline">
              {busy === a.stage ? <PredictSpinner className="size-4" /> : <a.icon className="h-3.5 w-3.5" />}
              {a.stage === "LEAD" && stage === "AUDIENCE" ? "Make lead (they enquired)" : a.label}
            </Button>
          ))}
        </div>
      )}
      {stage === "AUDIENCE" && (
        <p className="mb-3 text-xs text-muted-foreground">
          Audience: we messaged them but they never enquired, so they are not on the Leads list. A reply or a form
          makes them a lead on its own.
        </p>
      )}

      <p className="mb-1.5 text-xs font-medium text-muted-foreground">How to work them</p>
      <div className="flex flex-wrap gap-1.5">
        {ENGAGEMENT_ACTIONS.map((a) => {
          const active = engagement === a.engagement
          return (
            <Button
              key={a.engagement}
              onClick={() => patch(a.engagement, { engagement: active ? null : a.engagement })}
              disabled={busy !== null}
              title={a.note}
              size="sm"
              variant={
                active
                  ? a.engagement === "DO_NOT_CONTACT"
                    ? "destructive"
                    : "default"
                  : "outline"
              }
            >
              {busy === a.engagement ? (
                <PredictSpinner className="size-4" />
              ) : active ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <a.icon className="h-3.5 w-3.5" />
              )}
              {a.label}
            </Button>
          )
        })}
      </div>

      {engagement === "DO_NOT_CONTACT" && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          Marketing and reminder messages are switched off. Sends in those categories are skipped, not delivered.
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  )
}

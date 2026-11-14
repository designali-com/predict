"use client"

import { useState } from "react"
import { CheckCircle2, Navigation, XCircle } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { PredictSpinner } from "@/src/components/predict-loader"

const input =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm uppercase tracking-wider text-black focus:border-black/40 focus:outline-none dark:border-white/15 dark:bg-black dark:text-white"

const NOT_COLLECTED_REASONS = [
  "Patient not at home",
  "Patient not fasting",
  "Patient refused",
  "Could not reach the patient",
  "Wrong address",
]

/**
 * The sample-taking steps, the same in the lab and on the technician's phone:
 * set out (home visits), sample taken — with the kit's unique code — or not
 * taken, and why (which sends the order back to be booked again).
 */
export function CollectSteps({
  canStart,
  busy,
  onOnTheWay,
  onCollected,
  onNotCollected,
  large = false,
}: {
  /** Offer "On the way" — a home visit not yet started. */
  canStart: boolean
  busy: string | null
  onOnTheWay: () => void
  onCollected: (kitCode: string) => void
  onNotCollected: (reason: string) => void
  /** Bigger touch targets, for the field page. */
  large?: boolean
}) {
  const [mode, setMode] = useState<"idle" | "collect" | "missed">("idle")
  const [kit, setKit] = useState("")
  const [reason, setReason] = useState(NOT_COLLECTED_REASONS[0]!)
  const [other, setOther] = useState("")
  const size = large ? "default" : "sm"

  if (mode === "collect") {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          Kit code — printed on the kit (3 tubes)
          <input
            autoFocus
            value={kit}
            onChange={(e) => setKit(e.target.value)}
            placeholder="e.g. PK-000123"
            className={`${input} mt-1 font-mono`}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size={size} disabled={busy !== null || !kit.trim()} onClick={() => onCollected(kit.trim())}>
            {busy === "collected" ? <PredictSpinner className="size-4" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirm sample taken
          </Button>
          <Button size={size} variant="ghost" onClick={() => setMode("idle")}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  if (mode === "missed") {
    const finalReason = reason === "Other" ? other.trim() : reason
    return (
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          Why was the sample not taken?
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm dark:border-white/15 dark:bg-black"
          >
            {[...NOT_COLLECTED_REASONS, "Other"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        {reason === "Other" && (
          <input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Say what happened"
            className="w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm dark:border-white/15 dark:bg-black"
          />
        )}
        <p className="text-[11px] text-muted-foreground">The order goes back to the lab to book again.</p>
        <div className="flex flex-wrap gap-2">
          <Button size={size} variant="destructive" disabled={busy !== null || !finalReason} onClick={() => onNotCollected(finalReason)}>
            {busy === "not_collected" && <PredictSpinner className="size-4" />}
            Confirm not taken
          </Button>
          <Button size={size} variant="ghost" onClick={() => setMode("idle")}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-wrap gap-2 ${large ? "[&>button]:flex-1" : ""}`}>
      {canStart && (
        <Button size={size} variant="outline" disabled={busy !== null} onClick={onOnTheWay}>
          {busy === "on_the_way" ? <PredictSpinner className="size-4" /> : <Navigation className="h-4 w-4" />}
          On the way
        </Button>
      )}
      <Button size={size} disabled={busy !== null} onClick={() => setMode("collect")}>
        <CheckCircle2 className="h-4 w-4" />
        Sample taken
      </Button>
      <Button size={size} variant="ghost" className="text-red-600 dark:text-red-400" disabled={busy !== null} onClick={() => setMode("missed")}>
        <XCircle className="h-4 w-4" />
        Not taken
      </Button>
    </div>
  )
}

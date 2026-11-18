"use client"

import { useCallback, useEffect, useState } from "react"
import { Footprints, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import {
  ACTIVITY_LEVELS,
  COMMON_ACTIVITIES,
  INTENSITIES,
  PAIN_DURING,
  emptyActivity,
  emptyExerciseHistory,
  isEmptyExerciseHistory,
  type CurrentActivity,
  type ExerciseHistory,
} from "@workspace/db/exercise-history"
import { PredictSpinner } from "@/src/components/predict-loader"
import { RecordSection } from "./record-ui"

const input =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"
const label = "mb-1 block text-xs font-medium text-muted-foreground"

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
}

/** One of a few fixed answers, as buttons — quicker to tap than a dropdown while talking to the patient. */
function Choice({
  options,
  value,
  onChange,
}: {
  options: readonly string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(value === o ? "" : o)}
          className={`rounded-full border px-2.5 py-1 text-xs ${
            value === o ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/**
 * What exercise the patient does now — asked and filled in before anything is
 * prescribed, so the prescription builds on it. Above the prescription on the
 * Exercise tab; the AI that writes prescriptions reads it too.
 */
export function CurrentExercise({ contactId }: { contactId: string }) {
  const [saved, setSaved] = useState<ExerciseHistory | null | undefined>(undefined)
  const [draft, setDraft] = useState<ExerciseHistory | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/patients/${contactId}/exercise-history`)
    const data = await res.json().catch(() => null)
    setSaved(res.ok ? (data?.history ?? null) : null)
  }, [contactId])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!draft) return
    setBusy(true)
    const res = await fetch(`/api/staff/patients/${contactId}/exercise-history`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) return toast.error(data?.error ?? "Could not save")
    setSaved(data.history)
    setDraft(null)
    toast.success("Current exercise saved")
  }

  const set = <K extends keyof ExerciseHistory>(key: K, v: ExerciseHistory[K]) => setDraft((d) => (d ? { ...d, [key]: v } : d))
  const setRow = (i: number, patch: Partial<CurrentActivity>) =>
    setDraft((d) => (d ? { ...d, activities: d.activities.map((a, j) => (j === i ? { ...a, ...patch } : a)) } : d))
  const addRow = (name = "") => setDraft((d) => (d ? { ...d, activities: [...d.activities, emptyActivity(name)] } : d))
  const removeRow = (i: number) => setDraft((d) => (d ? { ...d, activities: d.activities.filter((_, j) => j !== i) } : d))

  const empty = isEmptyExerciseHistory(saved)
  const action =
    saved === undefined || draft ? undefined : (
      <Button size="sm" variant={empty ? "default" : "outline"} className="h-8" onClick={() => setDraft(structuredClone(saved ?? emptyExerciseHistory()))}>
        {empty ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        {empty ? "Ask & fill" : "Edit"}
      </Button>
    )

  let body: React.ReactNode
  if (saved === undefined) {
    body = (
      <div className="flex justify-center py-6">
        <PredictSpinner className="size-5" />
      </div>
    )
  } else if (draft) {
    const taken = new Set(draft.activities.map((a) => a.name))
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <span className={label}>How active are they overall?</span>
          <Choice options={ACTIVITY_LEVELS} value={draft.activityLevel} onChange={(v) => set("activityLevel", v)} />
        </div>

        <div className="flex flex-col gap-2">
          <span className={label}>What do they do now? Tap to add, or add your own.</span>
          <div className="flex flex-wrap gap-1">
            {COMMON_ACTIVITIES.filter((n) => !taken.has(n)).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => addRow(n)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                <Plus className="h-3 w-3" /> {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => addRow()}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> Other
            </button>
          </div>

          {draft.activities.map((a, i) => (
            <div key={i} className="flex flex-col gap-2.5 rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <input
                  className={`${input} font-medium`}
                  value={a.name}
                  placeholder="Exercise or activity"
                  onChange={(e) => setRow(i, { name: e.target.value })}
                />
                <button type="button" className="text-muted-foreground hover:text-red-600" title="Remove" onClick={() => removeRow(i)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <span className={label}>How often</span>
                  <input className={input} value={a.frequency} placeholder="5 days a week" onChange={(e) => setRow(i, { frequency: e.target.value })} />
                </div>
                <div>
                  <span className={label}>How long / how much</span>
                  <input className={input} value={a.duration} placeholder="30 min · 3 sets of 12" onChange={(e) => setRow(i, { duration: e.target.value })} />
                </div>
                <div>
                  <span className={label}>Since when</span>
                  <input className={input} value={a.since} placeholder="2 years" onChange={(e) => setRow(i, { since: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className={label}>Effort</span>
                  <Choice options={INTENSITIES} value={a.intensity} onChange={(v) => setRow(i, { intensity: v })} />
                </div>
                <div>
                  <span className={label}>Pain while doing it?</span>
                  <Choice options={PAIN_DURING} value={a.painDuring} onChange={(v) => setRow(i, { painDuring: v })} />
                </div>
              </div>
              <input
                className={input}
                value={a.notes}
                placeholder="Details — which exercises, weights, trainer, where it hurts…"
                onChange={(e) => setRow(i, { notes: e.target.value })}
              />
            </div>
          ))}
        </div>

        <div>
          <span className={label}>Anything they stopped doing — and why?</span>
          <input className={input} value={draft.stopped} placeholder="Stopped running 6 months ago because of knee pain" onChange={(e) => set("stopped", e.target.value)} />
        </div>
        <div>
          <span className={label}>Other notes</span>
          <textarea className={input} rows={2} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={save}>
            {busy && <PredictSpinner className="size-4" />}
            Save
          </Button>
        </div>
      </div>
    )
  } else if (empty) {
    body = null
  } else {
    const h = saved!
    body = (
      <div className="flex flex-col gap-3 text-sm">
        {h.activityLevel && (
          <p>
            <span className="text-muted-foreground">Overall: </span>
            <b>{h.activityLevel}</b>
          </p>
        )}
        {h.activities.length === 0 ? (
          <p className="text-muted-foreground">No regular exercise.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-2.5 py-1.5 font-medium">Exercise</th>
                  <th className="px-2.5 py-1.5 font-medium">How often</th>
                  <th className="px-2.5 py-1.5 font-medium">How long</th>
                  <th className="px-2.5 py-1.5 font-medium">Since</th>
                  <th className="px-2.5 py-1.5 font-medium">Effort</th>
                  <th className="px-2.5 py-1.5 font-medium">Pain</th>
                </tr>
              </thead>
              <tbody>
                {h.activities.map((a, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="px-2.5 py-1.5">
                      <p className="font-medium">{a.name}</p>
                      {a.notes && <p className="text-muted-foreground">{a.notes}</p>}
                    </td>
                    <td className="px-2.5 py-1.5">{a.frequency || "—"}</td>
                    <td className="px-2.5 py-1.5">{a.duration || "—"}</td>
                    <td className="px-2.5 py-1.5">{a.since || "—"}</td>
                    <td className="px-2.5 py-1.5">{a.intensity || "—"}</td>
                    <td className={`px-2.5 py-1.5 ${a.painDuring === "Yes" ? "font-medium text-red-600" : ""}`}>{a.painDuring || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {h.stopped && (
          <p>
            <span className="text-muted-foreground">Stopped: </span>
            {h.stopped}
          </p>
        )}
        {h.notes && (
          <p>
            <span className="text-muted-foreground">Notes: </span>
            {h.notes}
          </p>
        )}
        {h.updated && <p className="text-[11px] text-muted-foreground">Filled by {h.updated.byName} · {when(h.updated.at)}</p>}
      </div>
    )
  }

  return (
    <RecordSection title="Current exercise" icon={Footprints} action={action}>
      {body}
    </RecordSection>
  )
}

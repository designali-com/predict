"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { emptyExercise, type ExerciseProtocol } from "@workspace/db/exercise-protocol"
import { useValdTests } from "@/src/lib/dynamo/use-vald-tests"

const input =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"
const cell =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:border-ring focus:outline-none"
const label = "mb-1 block text-xs font-medium text-muted-foreground"

/**
 * Every field of an exercise prescription, as boxes — shared by a patient's
 * Exercise tab, the appointment page and the Care Plan Library.
 */
export function ExerciseProtocolForm({
  value: draft,
  onChange,
}: {
  value: ExerciseProtocol
  onChange: (next: ExerciseProtocol) => void
}) {
  const set = <K extends keyof ExerciseProtocol>(key: K, v: ExerciseProtocol[K]) => onChange({ ...draft, [key]: v })
  // The clinic's DynaMo test catalogue (vald_test_type).
  const { tests: valdTests, byKey } = useValdTests()
  const valdRegions = useMemo(() => [...new Set(valdTests.map((t) => t.region))].sort(), [valdTests])
  const setEx = (i: number, patch: Partial<ExerciseProtocol["exercises"][number]>) =>
    set("exercises", draft.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  const move = (i: number, by: number) => {
    const next = [...draft.exercises]
    const [x] = next.splice(i, 1)
    next.splice(i + by, 0, x!)
    set("exercises", next)
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>Prescription title *</label>
          <input className={input} value={draft.title} placeholder="Knee Strengthening Program" onChange={(e) => set("title", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Goal</label>
          <input className={input} value={draft.goal} placeholder="Reduce knee pain and strengthen the thigh muscles" onChange={(e) => set("goal", e.target.value)} />
        </div>
        <div>
          <label className={label}>Duration</label>
          <input className={input} value={draft.duration} placeholder="6 weeks" onChange={(e) => set("duration", e.target.value)} />
        </div>
        <div>
          <label className={label}>When</label>
          <input className={input} value={draft.schedule} placeholder="Once a day, morning" onChange={(e) => set("schedule", e.target.value)} />
        </div>
        <div>
          <label className={label}>Warm-up</label>
          <input className={input} value={draft.warmup} placeholder="5 minutes of slow walking" onChange={(e) => set("warmup", e.target.value)} />
        </div>
        <div>
          <label className={label}>Follow-up</label>
          <input className={input} value={draft.followUp} placeholder="Review after 2 weeks" onChange={(e) => set("followUp", e.target.value)} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Exercises</p>
        <div className="flex flex-col gap-2">
          {draft.exercises.map((e, i) => (
            <div key={i} className="rounded-md border border-border p-2.5">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                {e.vald && (
                  <span className="mt-1 shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    VALD
                  </span>
                )}
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_4rem_6rem_7rem_8rem]">
                  <input className={cell} value={e.name} placeholder="Exercise name" onChange={(ev) => setEx(i, { name: ev.target.value })} />
                  <input className={cell} value={e.sets} placeholder="Sets" onChange={(ev) => setEx(i, { sets: ev.target.value })} />
                  <input className={cell} value={e.reps} placeholder="Reps" onChange={(ev) => setEx(i, { reps: ev.target.value })} />
                  <input className={cell} value={e.hold} placeholder="Hold / time" onChange={(ev) => setEx(i, { hold: ev.target.value })} />
                  <input className={cell} value={e.frequency} placeholder="How often" onChange={(ev) => setEx(i, { frequency: ev.target.value })} />
                  <input className={`${cell} sm:col-span-3`} value={e.notes} placeholder="How to do it / caution (optional)" onChange={(ev) => setEx(i, { notes: ev.target.value })} />
                  <input className={`${cell} sm:col-span-2`} value={e.videoUrl} placeholder="Video link https://… (optional)" onChange={(ev) => setEx(i, { videoUrl: ev.target.value })} />
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === draft.exercises.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Remove exercise" onClick={() => set("exercises", draft.exercises.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => set("exercises", [...draft.exercises, emptyExercise()])}>
            <Plus /> Add exercise
          </Button>
          {/* A DynaMo test done at the clinic, on the same list as the home
              exercises — run from the Bluetooth runner on the patient's page. */}
          <select
            value=""
            onChange={(ev) => {
              const t = byKey(ev.target.value)
              if (!t) return
              set("exercises", [
                ...draft.exercises.filter((x) => x.name.trim() || x.vald),
                {
                  ...emptyExercise(),
                  name: t.label,
                  sets: "1",
                  reps: "Each side",
                  frequency: "Each clinic visit",
                  notes: `${t.kind === "rom" ? "Range of motion" : "Strength"} · ${t.positionLabel}`,
                  vald: t.key,
                  // The how-to video, so the line carries it like a home exercise does.
                  ...(t.videoUrl ? { videoUrl: t.videoUrl } : {}),
                },
              ])
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="">+ Add VALD test (at clinic)…</option>
            {valdTests.some((t) => t.featured) && (
              <optgroup label="Used at the clinic">
                {valdTests
                  .filter((t) => t.featured)
                  .map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label} — {t.kind === "rom" ? "ROM" : "Strength"}, {t.positionLabel}
                    </option>
                  ))}
              </optgroup>
            )}
            {valdRegions.map((region) => (
              <optgroup key={region} label={region}>
                {valdTests.filter((t) => t.region === region && !t.featured).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label} — {t.kind === "rom" ? "ROM" : "Strength"}, {t.positionLabel}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <ListEditor title="Precautions" items={draft.precautions} placeholder="Stop if pain is more than 5/10" onChange={(v) => set("precautions", v)} />
        <ListEditor title="Instructions" items={draft.instructions} placeholder="Ice for 10 min after the session" onChange={(v) => set("instructions", v)} />
      </div>
    </div>
  )
}

function ListEditor({
  title,
  items,
  placeholder,
  onChange,
}: {
  title: string
  items: string[]
  placeholder: string
  onChange: (items: string[]) => void
}) {
  const [adding, setAdding] = useState("")
  const add = () => {
    const v = adding.trim()
    if (!v) return
    onChange([...items, v])
    setAdding("")
  }
  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{title}</p>
      {items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm">
              <span className="min-w-0 flex-1">{item}</span>
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="rounded p-0.5 text-muted-foreground hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className={input}
          value={adding}
          placeholder={placeholder}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button size="sm" variant="outline" onClick={add} disabled={!adding.trim()}>
          <Plus /> Add
        </Button>
      </div>
    </section>
  )
}

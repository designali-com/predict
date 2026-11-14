"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, Plus, RotateCcw, Trash2 } from "lucide-react"
import type { Diet, PersonalizedPlan, PlanFocus, PlanSupplement } from "@workspace/db/diet-plan"

interface PlanResponse {
  plan: { plan: PersonalizedPlan; updatedAt: string } | null
  visibleToPatient: boolean
  error?: string
}

/** The editable part of a plan, as the form holds it — lists as one line per item. */
interface Draft {
  diet: Diet | null
  focus: { key?: string; title: string; text: string; domains?: string[] }[]
  supplements: { name: string; reason: string; caution: string; domains?: string[] }[]
  breakfast: string
  lunch: string
  dinner: string
  snacks: string
  drink: string
  avoid: string
  habits: string
  cautions: string
}

const MEALS = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snacks", label: "Snacks" },
] as const

const DIETS: { value: Diet | ""; label: string }[] = [
  { value: "", label: "Not said (vegetarian meals)" },
  { value: "veg", label: "Vegetarian" },
  { value: "egg", label: "Eggetarian" },
  { value: "nonveg", label: "Non-vegetarian" },
]

const joinLines = (items: string[]) => items.join("\n")
const splitLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

function toDraft(plan: PersonalizedPlan): Draft {
  return {
    diet: plan.diet,
    focus: plan.focus.map((f: PlanFocus) => ({ key: f.key, title: f.title, text: f.text, domains: f.domains })),
    supplements: plan.supplements.map((s: PlanSupplement) => ({
      name: s.name,
      reason: s.reason,
      caution: s.caution ?? "",
      domains: s.domains,
    })),
    breakfast: joinLines(plan.meals.breakfast),
    lunch: joinLines(plan.meals.lunch),
    dinner: joinLines(plan.meals.dinner),
    snacks: joinLines(plan.meals.snacks),
    drink: plan.drink,
    avoid: joinLines(plan.avoid),
    habits: joinLines(plan.habits),
    cautions: joinLines(plan.cautions),
  }
}

function fromDraft(d: Draft) {
  return {
    diet: d.diet,
    focus: d.focus.filter((f) => f.title.trim()).map((f) => ({ ...f, title: f.title.trim(), text: f.text.trim() })),
    supplements: d.supplements
      .filter((s) => s.name.trim())
      .map((s) => ({
        name: s.name.trim(),
        reason: s.reason.trim(),
        ...(s.caution.trim() ? { caution: s.caution.trim() } : {}),
        domains: s.domains,
      })),
    meals: {
      breakfast: splitLines(d.breakfast),
      lunch: splitLines(d.lunch),
      dinner: splitLines(d.dinner),
      snacks: splitLines(d.snacks),
    },
    drink: d.drink.trim(),
    avoid: splitLines(d.avoid),
    habits: splitLines(d.habits),
    cautions: splitLines(d.cautions),
  }
}

const input =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-1.5 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"
const textarea = `${input} resize-y leading-relaxed`
const label = "text-xs font-medium text-black/70 dark:text-white/55"
const hint = "text-[11px] text-black/50 dark:text-white/40"

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * The patient's diet and supplement plan, for the nutritionist to review
 * and change.
 *
 * The rules write the first version from the blood report and the
 * questionnaire; whatever is saved here is what the patient sees on their
 * dashboard. Once saved, a new report or changed answers no longer overwrite
 * it — they mark it outdated, and "Regenerate" is the nutritionist's choice.
 */
export function DietPlanEditor({ contactId }: { contactId: string }) {
  const [data, setData] = useState<PlanResponse | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<"save" | "regenerate" | null>(null)
  // Read-back first; the boxes only on Edit. The plan is long, and a page of
  // open textareas took the whole tab to show what fits in a few lines.
  const [editing, setEditing] = useState(false)

  const take = useCallback((body: PlanResponse) => {
    setData(body)
    setDraft(body.plan ? toDraft(body.plan.plan) : null)
  }, [])

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/patients/${contactId}/plan`)
    const body = (await res.json().catch(() => null)) as PlanResponse | null
    if (!res.ok || !body) {
      setError(body?.error ?? "Could not load the plan.")
      return
    }
    take(body)
  }, [contactId, take])

  useEffect(() => {
    load()
  }, [load])

  const saved = data?.plan?.plan ?? null
  const dirty = useMemo(
    () => !!saved && !!draft && JSON.stringify(fromDraft(draft)) !== JSON.stringify(fromDraft(toDraft(saved))),
    [saved, draft],
  )

  async function send(method: "PUT" | "POST", body: unknown, kind: "save" | "regenerate") {
    setBusy(kind)
    setError("")
    setNote("")
    try {
      const res = await fetch(`/api/staff/patients/${contactId}/plan`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const result = (await res.json().catch(() => null)) as PlanResponse | null
      if (!res.ok || !result) throw new Error(result?.error ?? "Could not save the plan.")
      take(result)
      setEditing(false)
      setNote(kind === "save" ? "Saved. The patient sees this version now." : "Regenerated from the report and answers.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the plan.")
    } finally {
      setBusy(null)
    }
  }

  if (!data && !error) {
    return (
      <div className="flex justify-center py-8">
        <PredictSpinner className="size-5" />
      </div>
    )
  }
  if (!saved || !draft) {
    return (
      <div className="flex flex-col gap-2">
        {error && <p className="text-sm text-red-500">{error}</p>}
        <p className="rounded-md border border-dashed border-black/15 p-6 text-center text-sm text-black/60 dark:border-white/10 dark:text-white/45">
          No plan yet. It is made as soon as this patient has a calculated blood report.
        </p>
      </div>
    )
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))

  const regenerate = () => {
    const warning = saved.edited
      ? "Regenerate from the report and answers? Your edits to this plan will be replaced."
      : "Regenerate from the current report and answers?"
    if (window.confirm(warning)) send("POST", { action: "regenerate" }, "regenerate")
  }

  const badges = (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {saved.edited ? (
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
          Edited by {saved.edited.byName} · {when(saved.edited.at)}
        </span>
      ) : (
        <span className="rounded-full bg-black/5 px-2 py-0.5 font-medium text-black/70 dark:bg-white/10 dark:text-white/60">
          Made by the rules · {when(saved.generatedAt)}
        </span>
      )}
      {data?.visibleToPatient ? (
        <span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">On the patient&apos;s dashboard</span>
      ) : (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-800 dark:text-amber-300">
          Hidden until the patient submits their questionnaire
        </span>
      )}
    </div>
  )

  if (!editing) {
    const list = (items: string[]) =>
      items.length ? (
        <ul className="list-disc space-y-0.5 pl-4 text-sm leading-snug">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-black/40 dark:text-white/30">—</p>
      )
    const block = (title: string, body: ReactNode) => (
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-medium text-black/55 dark:text-white/45">{title}</p>
        {body}
      </div>
    )
    const dietLabel = DIETS.find((d) => d.value === (saved.diet ?? ""))?.label ?? "Not said"

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {badges}
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" type="button" disabled={busy !== null} onClick={regenerate}>
              {busy === "regenerate" ? <PredictSpinner className="size-4" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Regenerate
            </Button>
            <Button size="sm" type="button" onClick={() => { setNote(""); setEditing(true) }}>
              Edit
            </Button>
          </div>
        </div>

        {saved.outdated && (
          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {saved.outdated.reason} ({when(saved.outdated.at)}) Regenerate to apply the rules to the new information.
            </span>
          </div>
        )}

        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {block("Meal preference", <p className="text-sm">{dietLabel}</p>)}
          {saved.clusters.length > 0 &&
            block(
              "Patterns the rules found",
              <p className="text-sm leading-snug">{saved.clusters.map((c) => c.name).join(", ")}</p>,
            )}
          {block(
            "Focus points",
            saved.focus.length ? (
              <ul className="space-y-1 text-sm leading-snug">
                {saved.focus.map((f, i) => (
                  <li key={i}>
                    <span className="font-medium">{f.title}</span>
                    {f.text && <span className="text-black/65 dark:text-white/55"> — {f.text}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              list([])
            ),
          )}
          {block(
            "Supplements",
            list(saved.supplements.map((s) => [s.name, s.reason, s.caution && `caution: ${s.caution}`].filter(Boolean).join(" — "))),
          )}
        </div>

        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {MEALS.map((m) => (
            <Fragment key={m.key}>{block(m.label, list(saved.meals[m.key]))}</Fragment>
          ))}
        </div>

        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {block("Cut down on", list(saved.avoid))}
          {block("Daily habits", list(saved.habits))}
          {block("Drink", <p className="text-sm leading-snug">{saved.drink || "—"}</p>)}
          {block("Cautions", list(saved.cautions))}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {note && <p className="text-xs text-emerald-700 dark:text-emerald-400">{note}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* WHERE IT STANDS */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {saved.edited ? (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-400">
              Edited by {saved.edited.byName} · {when(saved.edited.at)}
            </span>
          ) : (
            <span className="rounded-full bg-black/5 px-2.5 py-1 font-medium text-black/70 dark:bg-white/10 dark:text-white/60">
              Made by the rules · {when(saved.generatedAt)}
            </span>
          )}
          {data?.visibleToPatient ? (
            <span className="rounded-full bg-primary/15 px-2.5 py-1 font-medium text-primary">On the patient&apos;s dashboard</span>
          ) : (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-medium text-amber-800 dark:text-amber-300">
              Hidden until the patient submits their questionnaire
            </span>
          )}
        </div>

        {saved.outdated && (
          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {saved.outdated.reason} ({when(saved.outdated.at)}) Your edited plan was kept as it is. Regenerate to
              apply the rules to the new information — that replaces your edits.
            </span>
          </div>
        )}

        {saved.clusters.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className={label}>Patterns the rules found</p>
            {saved.clusters.map((c) => (
              <p key={c.key} className="rounded-md border-l-[3px] border-primary bg-primary/5 px-3 py-2 text-xs leading-relaxed">
                <span className="font-medium">{c.name}</span>
                <span className="text-black/60 dark:text-white/50"> — {c.evidence.join(", ")}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* DIET */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-diet" className={label}>
          Meal preference
        </label>
        <select
          id="plan-diet"
          value={draft.diet ?? ""}
          onChange={(e) => set("diet", (e.target.value || null) as Diet | null)}
          className={`${input} sm:w-72`}
        >
          {DIETS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {/* FOCUS */}
      <div className="flex flex-col gap-2">
        <p className={label}>Focus points</p>
        {draft.focus.map((f, i) => (
          <div key={i} className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <input
                value={f.title}
                placeholder="Title — Bring triglycerides down"
                onChange={(e) => set("focus", draft.focus.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                className={input}
              />
              <textarea
                value={f.text}
                rows={2}
                placeholder="What the patient should do"
                onChange={(e) => set("focus", draft.focus.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                className={textarea}
              />
            </div>
            <Button variant="ghost" size="default" className="self-start text-black/50 hover:bg-black/5 hover:text-red-600 dark:text-white/40 dark:hover:bg-white/10"
 type="button"
 aria-label="Remove focus point"
 onClick={() => set("focus", draft.focus.filter((_, j) => j !== i))}

 >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="link" size="sm" className="self-start text-primary hover:underline"
 type="button"
 onClick={() => set("focus", [...draft.focus, { title: "", text: "" }])}

 >
          <Plus className="h-3.5 w-3.5" /> Add focus point
        </Button>
      </div>

      {/* SUPPLEMENTS */}
      <div className="flex flex-col gap-2">
        <p className={label}>Supplements</p>
        {draft.supplements.length === 0 && <p className={hint}>None. The rules only add supplements for a recognised cluster, or low vitamin D.</p>}
        {draft.supplements.map((s, i) => (
          <div key={i} className="flex gap-2">
            <div className="grid flex-1 gap-1.5 sm:grid-cols-3">
              <input
                value={s.name}
                placeholder="Name — Omega-3 fish oil"
                onChange={(e) => set("supplements", draft.supplements.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                className={input}
              />
              <input
                value={s.reason}
                placeholder="Why"
                onChange={(e) => set("supplements", draft.supplements.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))}
                className={input}
              />
              <input
                value={s.caution}
                placeholder="Caution (optional)"
                onChange={(e) => set("supplements", draft.supplements.map((x, j) => (j === i ? { ...x, caution: e.target.value } : x)))}
                className={input}
              />
            </div>
            <Button variant="ghost" size="default" className="self-start text-black/50 hover:bg-black/5 hover:text-red-600 dark:text-white/40 dark:hover:bg-white/10"
 type="button"
 aria-label="Remove supplement"
 onClick={() => set("supplements", draft.supplements.filter((_, j) => j !== i))}

 >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="link" size="sm" className="self-start text-primary hover:underline"
 type="button"
 onClick={() => set("supplements", [...draft.supplements, { name: "", reason: "", caution: "" }])}

 >
          <Plus className="h-3.5 w-3.5" /> Add supplement
        </Button>
      </div>

      {/* MEALS */}
      <div className="flex flex-col gap-2">
        <p className={label}>Meals</p>
        <p className={hint}>One option per line. The patient is told to choose one.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {MEALS.map((m) => (
            <div key={m.key} className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-widest text-black/55 dark:text-white/40">{m.label}</span>
              <textarea value={draft[m.key]} rows={5} onChange={(e) => set(m.key, e.target.value)} className={textarea} />
            </div>
          ))}
        </div>
      </div>

      {/* THE REST */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className={label}>Cut down on</span>
          <textarea value={draft.avoid} rows={4} onChange={(e) => set("avoid", e.target.value)} className={textarea} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Daily habits</span>
          <textarea value={draft.habits} rows={4} onChange={(e) => set("habits", e.target.value)} className={textarea} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Drink</span>
          <textarea value={draft.drink} rows={2} onChange={(e) => set("drink", e.target.value)} className={textarea} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Cautions</span>
          <textarea value={draft.cautions} rows={2} onChange={(e) => set("cautions", e.target.value)} className={textarea} />
          <span className={hint}>Shown to the patient too.</span>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="flex flex-wrap items-center gap-3 border-t border-black/10 pt-4 dark:border-white/10">
        <Button variant="default" size="default" className="text-white"
 type="button"
 disabled={!dirty || busy !== null}
 onClick={() => send("PUT", fromDraft(draft), "save")}

 >
          {busy === "save" && <PredictSpinner className="size-4" />}
          Save changes
        </Button>
        {/* Back to the read-back, dropping whatever was changed here. */}
        <Button variant="outline" size="default"
 type="button"
 disabled={busy !== null}
 onClick={() => {
 setDraft(toDraft(saved))
 setEditing(false)
 }}
 >
          Cancel
        </Button>
        <Button variant="ghost" size="default" className="ml-auto text-black/70 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
 type="button"
 disabled={busy !== null}
 onClick={regenerate}
 >
          {busy === "regenerate" ? <PredictSpinner className="size-4" /> : <RotateCcw className="h-4 w-4" />}
          Regenerate from rules
        </Button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {note && <p className="text-xs text-emerald-700 dark:text-emerald-400">{note}</p>}
    </div>
  )
}

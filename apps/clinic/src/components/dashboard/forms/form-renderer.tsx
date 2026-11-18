"use client"

import { Button } from "@workspace/ui/components/button"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, Plus, Save, X } from "lucide-react"
import type { FormDefinition, FormField } from "@workspace/db/clinical-forms"
import { formFields, isFieldVisible } from "@workspace/db/clinical-forms"
import { ConsentBlock, type Consent } from "./consent-block"
import {
  ageFromDob,
  anthropometrics,
  percent,
  round1,
  round2,
  womacTotals,
} from "@workspace/db/form-scoring"
import { PredictSpinner } from "@/src/components/predict-loader"

type Answers = Record<string, unknown>

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:border-ring focus:outline-none"

const RECALL_FROM: [string, string][] = [
  ["breakfast", "Breakfast"],
  ["mid_morning", "Mid-morning"],
  ["lunch", "Lunch"],
  ["evening_snack", "Evening snack"],
  ["dinner", "Dinner"],
  ["post_dinner", "Post dinner"],
]

function foldFoodRecall(answers: Answers): Answers {
  if (Array.isArray(answers.meals)) return answers
  const meals = RECALL_FROM.flatMap(([key, meal]) => {
    const text = answers[key]
    if (typeof text !== "string" || !text.trim()) return []
    return [{ meal, time: "", text }]
  })
  return meals.length ? { ...answers, meals } : answers
}

/**
 * One renderer for every clinical form.
 *
 * FORM-I, FORM-II, FORM-III and the provisional diagnosis are four different
 * documents with about two hundred questions between them, and they are printed
 * documents the clinic revises. A screen per form would mean four screens to
 * change every time one is reprinted, and the fourth would be the one nobody
 * remembered. So the questions come from a definition and this draws whatever
 * it is handed.
 *
 * Computed fields — BMI, the WOMAC percentages — are read-only and recalculated
 * as you type, from the same functions the server scores with. Typing a
 * percentage that disagrees with the answers above it is the single most likely
 * way these forms go wrong on paper.
 */
export function FormRenderer({
  definition,
  initialAnswers,
  submitted,
  onSave,
  onSubmit,
  readOnly = false,
  editing,
  onEditingChange,
  consent,
  onConsentChange,
  onAnswersChange,
  hideTitle = false,
}: {
  /** The panel around this already shows the title and status. */
  hideTitle?: boolean
  definition: FormDefinition
  initialAnswers: Answers
  submitted: boolean
  onSave: (answers: Answers) => Promise<string | null>
  onSubmit: (answers: Answers) => Promise<string | null>
  readOnly?: boolean
  /** Owned by the panel around this — its header carries the edit control. */
  editing: boolean
  onEditingChange: (editing: boolean) => void
  /** The consent and signature at the foot of the form. */
  consent: Consent
  onConsentChange: (consent: Consent) => void
  /** Every keystroke, so the panel can keep unsaved work across a switch. */
  onAnswersChange?: (answers: Answers) => void
}) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers)
  const [busy, setBusy] = useState<"save" | "submit" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const years = ageFromDob(String(initialAnswers.dob ?? ""))
    // Only fills a gap. An age already on the form is left alone — it may
    // have been corrected by hand, and overwriting it on every open would
    // silently undo that.
    const blank = initialAnswers.age === undefined || initialAnswers.age === null || initialAnswers.age === ""
    const base = years !== null && blank ? { ...initialAnswers, age: years } : initialAnswers
    setAnswers(definition.key === "nutrition_consult" ? foldFoodRecall(base) : base)
  }, [initialAnswers, definition.key])

  // Kept in sync from effects rather than assigned while rendering. `set`
  // writes answersRef itself, so two keystrokes in one handler still build on
  // each other without waiting for a render.
  const answersRef = useRef(answers)
  const reportRef = useRef(onAnswersChange)
  useEffect(() => {
    answersRef.current = answers
  }, [answers])
  useEffect(() => {
    reportRef.current = onAnswersChange
  }, [onAnswersChange])

  const set = useCallback((key: string, value: unknown) => {
    const next = { ...answersRef.current, [key]: value }

    // Age follows from the date of birth, so it is filled in rather than
    // asked twice — a chart carrying a DOB and an age that contradict it
    // cannot be resolved later. Still editable afterwards: a patient who
    // does not know their birthday gives an age and no date.
    if (key === "dob") {
      const years = ageFromDob(String(value ?? ""))
      if (years !== null) next.age = years
    }

    answersRef.current = next
    setAnswers(next)
    reportRef.current?.(next)
    setSaved(false)
  }, [])

  const allFields = useMemo(() => formFields(definition), [definition])

  // Every form opens as a compact read-back — submitted, draft or empty — and
  // turns into boxes only when someone presses Edit. A wall of open inputs
  // took a screen per form and read as "still to do" even when it was done.
  const locked = readOnly || !editing

  // Recomputed on every keystroke from the same functions the server uses, so
  // what the doctor reads is what gets stored against the visit.
  const computed = useMemo(() => {
    const out: Record<string, string> = {}

    if (definition.key === "questionnaire") {
      const w = womacTotals(answers)
      out.womac_pain_percent = percent(w.pain.percent)
      out.womac_stiffness_percent = percent(w.stiffness.percent)
      out.womac_function_percent = percent(w.function.percent)
      out.womac_total_percent = percent(w.total.percent)
    }

    if (definition.key === "measurements") {
      const a = anthropometrics(answers)
      out.bmi = round1(a.bmi)
      out.whpr = round2(a.whpr)
      out.whtr = round2(a.whtr)
    }

    return out
  }, [definition.key, answers])

  const run = async (kind: "save" | "submit") => {
    setBusy(kind)
    setError(null)
    try {
      const message = kind === "save" ? await onSave(answers) : await onSubmit(answers)
      if (message) {
        setError(message)
        return
      }
      setSaved(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {!hideTitle && (
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{definition.title}</h2>
          {submitted && (
            <span className="flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
              <Check className="h-3 w-3" />
              Submitted
            </span>
          )}
        </div>
      )}

      {locked ? (
        <Summary
          definition={definition}
          answers={answers}
          computed={computed}
          fields={allFields}
          submitted={submitted}
        />
      ) : (
        definition.sections.map((section) => (
        <section key={section.title} className="rounded-md border border-border p-4">
          <div className="mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{section.title}</h3>
              {section.printedAs && (
                <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  {section.printedAs}
                </span>
              )}
            </div>
            {section.description && (
              <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* A field can wait for another to be answered — see showWhen on
                the definition. Hidden rather than disabled: a greyed-out box
                still reads as something you have to deal with. */}
            {section.fields
              .filter((field) => isFieldVisible(field, answers, allFields))
              .map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={answers[field.key]}
                  computed={computed[field.key]}
                  readOnly={readOnly}
                  onChange={(v) => set(field.key, v)}
                />
              ))}
          </div>
        </section>
        ))
      )}

      {/* Every form ends the way the paper does. Read-only once signed —
          drawing over a signature somebody gave is not something this screen
          should make easy. */}
      {/* In the read-back an unsigned, unticked consent is just an empty box —
          left out until someone is filling the form in. */}
      {(!locked || consent.given || consent.signatureDataUrl) && (
        <ConsentBlock
          value={consent}
          onChange={onConsentChange}
          readOnly={locked || Boolean(consent.signatureDataUrl && submitted && !editing)}
        />
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Save keeps a half-filled form. These are long documents filled at a
              counter with a queue behind them, and losing FORM-I to an
              interruption is how people go back to paper. */}
          <Button variant="outline" size="default"
 onClick={() => run("save")}
 disabled={busy !== null}

 >
            {busy === "save" ? (
              <PredictSpinner className="size-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save draft
          </Button>
          <Button variant="default" size="default"
 onClick={() => run("submit")}
 disabled={busy !== null}

 >
            {busy === "submit" && <PredictSpinner className="size-4" />}
            {submitted ? "Save changes" : "Submit form"}
          </Button>
          {/* Back to the read-back. Whatever was typed stays on this screen
              (and in the browser's draft) — Close does not throw it away. */}
          <Button variant="outline" size="default"
 onClick={() => onEditingChange(false)}
 disabled={busy !== null}

 >
            {submitted ? "Done" : "Close"}
          </Button>
          {saved && <span className="text-xs text-muted-foreground">Saved.</span>}

          {/* The two buttons do different things and the difference matters:
              one keeps your place, the other hands the visit on. */}
          <p className="w-full text-xs text-muted-foreground">
            <strong className="font-medium">Save draft</strong> keeps what you have typed, on
            this visit, to come back to. The visit does not move on.{" "}
            <strong className="font-medium">{submitted ? "Save changes" : "Submit form"}</strong>{" "}
            {submitted
              ? "corrects what was already submitted; it stays submitted."
              : "hands it on — the visit moves to whoever comes next."}
          </p>
        </div>
      )}
    </div>
  )
}

function Field({
  field,
  value,
  computed,
  readOnly,
  onChange,
}: {
  field: FormField
  value: unknown
  computed?: string
  readOnly: boolean
  onChange: (v: unknown) => void
}) {
  if (field.type === "recall") {
    return (
      <div className="sm:col-span-2">
        <Control field={field} value={value} computed={computed} readOnly={readOnly} onChange={onChange} />
      </div>
    )
  }

  const wide = field.wide || field.type === "multi" || field.type === "textarea"

  return (
    <label className={wide ? "sm:col-span-2" : undefined}>
      <span className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs font-medium">
        <span>
          {field.label}
          {field.required && <span className="ml-0.5 text-red-600">*</span>}
        </span>
        {/* The reference range from the printed form, beside the box rather
            than in a legend — it is only useful while the number is going in. */}
        {field.normal && (
          <span className="text-[11px] font-normal text-muted-foreground">
            normal {field.normal}
          </span>
        )}
      </span>

      <Control
        field={field}
        value={value}
        computed={computed}
        readOnly={readOnly}
        onChange={onChange}
      />

      {field.help && (
        <span className="mt-1 block text-[11px] text-muted-foreground">{field.help}</span>
      )}
    </label>
  )
}

function Control({
  field,
  value,
  computed,
  readOnly,
  onChange,
}: {
  field: FormField
  value: unknown
  computed?: string
  readOnly: boolean
  onChange: (v: unknown) => void
}) {
  if (field.type === "computed") {
    return (
      <output className="flex items-baseline gap-1 rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-2 text-sm font-medium tabular-nums">
        {computed ?? "—"}
        {field.unit && <span className="text-xs text-muted-foreground">{field.unit}</span>}
      </output>
    )
  }

  if (field.type === "boolean") {
    // Two buttons rather than a checkbox: on paper these are YES / NO boxes,
    // and a single checkbox cannot tell "no" from "not asked".
    const yes = value === true
    const no = value === false
    return (
      <div className="flex gap-1.5">
        {(
          [
            ["Yes", true, yes],
            ["No", false, no],
          ] as const
        ).map(([label, next, on]) => (
          <Button variant="ghost" size="default"
            key={label}
            type="button"
            disabled={readOnly}
            aria-pressed={on}
            onClick={() => onChange(on ? null : next)}
            className={`h-auto justify-start whitespace-normal text-left flex-1 border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
 on
 ?"border-transparent bg-primary text-primary-foreground"
 :"border-border text-muted-foreground hover:border-ring"
 }`}
          >
            {label}
          </Button>
        ))}
      </div>
    )
  }

  if (field.type === "multi") {
    const chosen = Array.isArray(value) ? (value as string[]) : []
    return (
      <div className="flex flex-wrap gap-1.5">
        {(field.options ?? []).map((option) => {
          const on = chosen.includes(option)
          return (
            <Button variant="ghost" size="sm"
              key={option}
              type="button"
              disabled={readOnly}
              aria-pressed={on}
              onClick={() =>
                onChange(on ? chosen.filter((c) => c !== option) : [...chosen, option])
              }
              className={`border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
 on
 ?"border-transparent bg-primary text-primary-foreground"
 :"border-border text-muted-foreground hover:border-ring"
 }`}
            >
              {option}
            </Button>
          )
        })}
      </div>
    )
  }

  if (field.type === "select") {
    return (
      <select
        disabled={readOnly}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputClass}
      >
        <option value="">—</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === "recall") {
    const rows = Array.isArray(value)
      ? value.flatMap((row) => {
          if (!row || typeof row !== "object") return []
          const item = row as { meal?: unknown; time?: unknown; text?: unknown }
          return [{
            meal: typeof item.meal === "string" ? item.meal : "",
            time: typeof item.time === "string" ? item.time : "",
            text: typeof item.text === "string" ? item.text : "",
          }]
        })
      : []
    const options = field.options ?? []
    const write = (next: typeof rows) => onChange(next)

    return (
      <div className="flex flex-col gap-2">
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => write([...rows, { meal: "", time: "", text: "" }])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        )}
        {rows.map((row, index) => (
          <div key={index} className="grid items-center gap-2 sm:grid-cols-[10.5rem_7rem_minmax(0,1fr)_2rem]">
            <select
              disabled={readOnly}
              value={row.meal}
              aria-label="Meal"
              onChange={(e) => write(rows.map((item, i) => (i === index ? { ...item, meal: e.target.value } : item)))}
              className={`${inputClass} h-9`}
            >
              <option value="">Meal</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              disabled={readOnly}
              type="time"
              aria-label="Time"
              value={row.time}
              onChange={(e) => write(rows.map((item, i) => (i === index ? { ...item, time: e.target.value } : item)))}
              className={`${inputClass} h-9`}
            />
            <input
              disabled={readOnly}
              type="text"
              aria-label="What they ate"
              placeholder="What they ate"
              value={row.text}
              onChange={(e) => write(rows.map((item, i) => (i === index ? { ...item, text: e.target.value } : item)))}
              className={`${inputClass} h-9`}
            />
            {!readOnly && (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Remove meal"
                onClick={() => write(rows.filter((_, i) => i !== index))}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (field.type === "textarea") {
    return (
      <textarea
        disabled={readOnly}
        rows={3}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        disabled={readOnly}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        step={field.type === "number" ? "any" : undefined}
        value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        onChange={(e) =>
          onChange(
            field.type === "number"
              ? e.target.value === ""
                ? null
                : Number(e.target.value)
              : e.target.value,
          )
        }
        className={inputClass}
      />
      {field.unit && <span className="shrink-0 text-xs text-muted-foreground">{field.unit}</span>}
    </div>
  )
}

/**
 * What was actually filled in — and only that.
 *
 * A read-back of every question, most of them empty, is the form again with the
 * inputs taken away: it hides six answers among two hundred dashes. So an
 * unanswered question is not shown at all, and a section where nothing was
 * answered goes with it.
 *
 * "Not answered" and "answered No" are different things, which is why false
 * prints as No rather than being dropped for being falsy.
 */
function Summary({
  definition,
  answers,
  computed,
  fields,
  submitted,
}: {
  definition: FormDefinition
  answers: Answers
  computed: Record<string, string>
  fields: FormField[]
  submitted: boolean
}) {
  const shown = (field: FormField): string | null => {
    if (field.type === "computed") {
      const c = computed[field.key]
      return c && c !== "—" ? c : null
    }

    const value = answers[field.key]
    if (value === undefined || value === null) return null
    if (typeof value === "boolean") return value ? "Yes" : "No"
    if (field.type === "recall" && Array.isArray(value)) {
      const lines = value.flatMap((row) => {
        if (!row || typeof row !== "object") return []
        const item = row as { meal?: unknown; time?: unknown; text?: unknown }
        const meal = typeof item.meal === "string" ? item.meal : ""
        const time = typeof item.time === "string" ? item.time : ""
        const text = typeof item.text === "string" ? item.text.trim() : ""
        const head = [meal, time].filter(Boolean).join(" · ")
        if (!head && !text) return []
        return [head && text ? `${head} — ${text}` : head || text]
      })
      return lines.length ? lines.join("\n") : null
    }
    if (Array.isArray(value)) return value.length ? value.join(", ") : null

    const text = String(value).trim()
    return text === "" ? null : text
  }

  const sections = definition.sections
    .map((section) => ({
      title: section.title,
      rows: section.fields
        .filter((field) => isFieldVisible(field, answers, fields))
        .map((field) => ({ field, value: shown(field) }))
        .filter((row): row is { field: FormField; value: string } => row.value !== null),
    }))
    .filter((section) => section.rows.length > 0)

  if (sections.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        {submitted ? "Submitted with nothing filled in." : "Not filled yet."}
      </p>
    )
  }

  // Dense on purpose: only what was answered, three to a row on a wide
  // screen, so a whole form reads in one glance instead of a page of boxes.
  return (
    <div className="flex flex-col gap-2.5">
      {sections.map((section) => (
        <section key={section.title} className="rounded-md border border-border px-3 py-2.5">
          <h3 className="mb-1.5 text-xs font-semibold">{section.title}</h3>
          <dl className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {section.rows.map(({ field, value }) => (
              <div
                key={field.key}
                className={field.wide || field.type === "recall" ? "sm:col-span-2 lg:col-span-3" : undefined}
              >
                <dt className="text-[11px] text-muted-foreground">{field.label}</dt>
                <dd className="text-sm leading-snug whitespace-pre-wrap">
                  {value}
                  {field.unit && (
                    <span className="ml-1 text-xs text-muted-foreground">{field.unit}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

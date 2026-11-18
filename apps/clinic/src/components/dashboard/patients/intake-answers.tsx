"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useState } from "react"
import { ClipboardList, PenLine } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import {
  INTAKE_STEPS,
  INTAKE_STEP_COUNT,
  formatIntakeAnswer,
  intakeStepProblem,
  isIntakeFieldVisible,
  type IntakeAnswers,
  type IntakeField,
} from "@workspace/db/patient-intake"
import { RecordSection } from "./record-ui"

interface Intake {
  status: "draft" | "submitted"
  answers: IntakeAnswers
  resumeStep: number
  filledBy?: "patient" | "clinic"
  submittedAt: string | null
  updatedAt: string
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })

/** The questions with no label of their own on the patient's screen get one here. */
const labelOf = (field: IntakeField) =>
  field.label || (field.key === "digestion_issues" ? "Noticed" : field.key === "allergy_details" ? "Allergy details" : field.key)

/**
 * The patient's plan questionnaire — the same questions they answer on their
 * dashboard under Personalised Plan.
 *
 * Read step by step in the order they were asked. Not every patient fills it
 * in themselves, so the clinic can ask the same questions here ("Fill in at
 * clinic") — saved as theirs would be, and once submitted the plan is made
 * from it and the blood work. Medicines and allergies are called out: the
 * questionnaire tells the patient that is the part the nutritionist reads first.
 */
export function PatientIntakeAnswers({ contactId }: { contactId: string }) {
  const [intake, setIntake] = useState<Intake | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/staff/patients/${contactId}/intake`)
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!live) return
        if (!res.ok) setError(data?.error ?? "Could not load the questionnaire.")
        else setIntake(data?.intake ?? null)
      })
      .finally(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [contactId])

  const wrap = (body: React.ReactNode, action?: React.ReactNode) => (
    <RecordSection title="Plan questionnaire" icon={ClipboardList} action={action}>
      {body}
    </RecordSection>
  )

  if (!loaded) {
    return wrap(
      <div className="flex justify-center py-8">
        <PredictSpinner className="size-5" />
      </div>,
    )
  }
  if (error) return wrap(<p className="text-sm text-red-500">{error}</p>)

  if (editing) {
    return wrap(
      <IntakeClinicForm
        contactId={contactId}
        initial={intake?.answers ?? {}}
        submitted={intake?.status === "submitted"}
        onCancel={() => setEditing(false)}
        onSaved={(next) => {
          setIntake(next)
          setEditing(false)
        }}
      />,
    )
  }

  const fillButton = (
    <Button size="sm" variant={intake ? "outline" : "default"} onClick={() => setEditing(true)}>
      <PenLine /> {intake ? "Edit answers" : "Fill in at clinic"}
    </Button>
  )

  if (!intake) {
    return wrap(
      <p className="text-sm text-muted-foreground">Not answered yet — by the patient on their dashboard, or here at the clinic.</p>,
      fillButton,
    )
  }

  const answers = intake.answers

  return wrap(
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {intake.status === "submitted" ? (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-400">
            Submitted {intake.submittedAt ? when(intake.submittedAt) : ""}
          </span>
        ) : (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-medium text-amber-800 dark:text-amber-300">
            {intake.filledBy === "clinic" ? "Draft — not submitted" : `In progress — on step ${intake.resumeStep + 1} of ${INTAKE_STEP_COUNT}`}
          </span>
        )}
        <span className="text-black/50 dark:text-white/40">
          {intake.filledBy === "clinic" ? "Answered at the clinic" : "Answered by the patient"} · last changed {when(intake.updatedAt)}
        </span>
      </div>

      {INTAKE_STEPS.map((step) => {
        // Insight notes are something the patient was told, not something
        // they answered — nothing to show here.
        const fields = step.fields.filter((f) => f.kind !== "insight" && isIntakeFieldVisible(f, answers))
        const answered = fields.filter((f) => formatIntakeAnswer(f, answers[f.key]) !== "")
        const priority = step.key === "medicines"

        return (
          <section
            key={step.key}
            className={`rounded-md border p-4 ${
              priority
                ? "border-amber-300 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20"
                : "border-black/12 dark:border-white/10"
            }`}
          >
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{step.title}</h3>
              {answered.length === 0 && (
                <span className="text-[11px] text-black/45 dark:text-white/35">
                  {step.skippable ? "Skipped" : "Not answered"}
                </span>
              )}
            </div>

            {answered.length > 0 && (
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {fields.map((field) => {
                  const text = formatIntakeAnswer(field, answers[field.key])
                  const long = field.kind === "textarea" || field.kind === "meal"
                  return (
                    <div key={field.key} className={long ? "sm:col-span-2" : ""}>
                      <dt className="text-[11px] uppercase tracking-wide text-black/50 dark:text-white/40">{labelOf(field)}</dt>
                      <dd className={`text-sm ${text ? "" : "text-black/35 dark:text-white/30"}`}>
                        {text || "—"}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            )}
          </section>
        )
      })}
    </div>,
    fillButton,
  )
}

const INPUT =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-1.5 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

/**
 * Every question of the questionnaire on one page, for staff asking the
 * patient at the clinic. The same questions, options and rules as the
 * patient's own screens: follow-up questions appear when an answer calls for
 * them, and "None" clears the rest of a list.
 */
function IntakeClinicForm({
  contactId,
  initial,
  submitted,
  onCancel,
  onSaved,
}: {
  contactId: string
  initial: IntakeAnswers
  submitted: boolean
  onCancel: () => void
  onSaved: (intake: Intake) => void
}) {
  const [answers, setAnswers] = useState<IntakeAnswers>(initial)
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = (key: string, value: string | string[]) => setAnswers((a) => ({ ...a, [key]: value }))
  const list = (key: string) => {
    const v = answers[key]
    return Array.isArray(v) ? v : v ? [v] : []
  }

  async function save(submit: boolean) {
    if (submit) {
      const problem = intakeStepProblem(0, answers)
      if (problem) {
        setError(problem)
        return
      }
    }
    setBusy(submit ? "submit" : "draft")
    setError(null)
    const res = await fetch(`/api/staff/patients/${contactId}/intake`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, submit }),
    })
    const data = await res.json().catch(() => null)
    setBusy(null)
    if (!res.ok) {
      setError(data?.error ?? "Could not save the answers.")
      return
    }
    toast.success(submit ? "Questionnaire submitted — the plan is made from it" : "Answers saved as a draft")
    onSaved(data.intake as Intake)
  }

  const field = (f: IntakeField) => {
    if (f.kind === "insight" || !isIntakeFieldVisible(f, answers)) return null
    const value = answers[f.key]
    const label = (
      <span className="mb-1 block text-xs font-medium text-black/70 dark:text-white/55">
        {labelOf(f)}
        {"required" in f && f.required ? <span className="text-red-600"> *</span> : null}
      </span>
    )

    if (f.kind === "number" || f.kind === "slider") {
      const hint = f.kind === "slider" ? `${f.min}–${f.maxLabel}` : null
      return (
        <label key={f.key} className="block">
          {label}
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={f.min}
              max={f.max}
              value={typeof value === "string" ? value : ""}
              placeholder={f.kind === "number" ? f.placeholder : String(f.start)}
              onChange={(e) => set(f.key, e.target.value)}
              className={`${INPUT} max-w-32`}
            />
            <span className="text-xs text-muted-foreground">
              {f.unit}
              {hint ? ` (${hint})` : ""}
            </span>
          </div>
        </label>
      )
    }

    if (f.kind === "text") {
      return (
        <label key={f.key} className="block">
          {label}
          <input value={typeof value === "string" ? value : ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} className={INPUT} />
        </label>
      )
    }

    if (f.kind === "textarea" || f.kind === "meal") {
      return (
        <label key={f.key} className="block sm:col-span-2">
          {label}
          {f.kind === "meal" && <span className="-mt-0.5 mb-1 block text-[11px] text-muted-foreground">{f.hint}</span>}
          <textarea
            rows={2}
            value={typeof value === "string" ? value : ""}
            placeholder={f.placeholder}
            onChange={(e) => set(f.key, e.target.value)}
            className={INPUT}
          />
        </label>
      )
    }

    // single / multi — chips, as on the patient's screen.
    if (f.kind !== "single" && f.kind !== "multi") return null
    const chosen = list(f.key)
    const toggle = (opt: string) => {
      if (f.kind === "single") return set(f.key, chosen[0] === opt ? "" : opt)
      if (chosen.includes(opt)) return set(f.key, chosen.filter((x) => x !== opt))
      if (f.exclusive && opt === f.exclusive) return set(f.key, [opt])
      return set(f.key, [...chosen.filter((x) => x !== f.exclusive), opt])
    }
    return (
      <div key={f.key} className={f.options.length > 4 ? "sm:col-span-2" : ""}>
        {label}
        <div className="flex flex-wrap gap-1.5">
          {f.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              aria-pressed={chosen.includes(opt)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                chosen.includes(opt) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {INTAKE_STEPS.map((step) => (
        <section
          key={step.key}
          className={`rounded-md border p-4 ${
            step.key === "medicines" ? "border-amber-300 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20" : "border-black/12 dark:border-white/10"
          }`}
        >
          <h3 className="mb-3 text-sm font-semibold">{step.title}</h3>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{step.fields.map(field)}</div>
        </section>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button onClick={() => save(true)} disabled={busy !== null}>
          {busy === "submit" && <PredictSpinner className="size-4" />}
          {submitted ? "Save answers" : "Submit & make plan"}
        </Button>
        {!submitted && (
          <Button variant="outline" onClick={() => save(false)} disabled={busy !== null}>
            {busy === "draft" && <PredictSpinner className="size-4" />}
            Save draft
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} disabled={busy !== null}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, Loader2, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { LogoIcon } from "../../logo"
import {
  INTAKE_STEPS,
  INTAKE_STEP_COUNT,
  insightApplies,
  intakeStepProblem,
  isIntakeFieldVisible,
  type IntakeAnswers,
  type IntakeField,
  type IntakeFlags,
} from "@workspace/db/patient-intake"

/**
 * The plan questionnaire — eight steps, one at a time, then "That's
 * everything".
 *
 * Drawn to the design exactly, and deliberately dark whatever the rest of
 * the dashboard is set to: it is a focused, phone-shaped moment, and the
 * design is dark. On a phone it takes the whole screen; on anything wider it
 * is the same card, centred over the dashboard.
 *
 * Progress is saved on every Continue, so closing it halfway loses nothing
 * and the patient comes back to the step they left.
 */

// The design's palette, kept here so the component reads the same in a
// light-mode dashboard as in a dark one.
const C = {
  surface: "bg-[#0B0910]",
  field: "bg-[#15121B]",
  chip: "bg-[#121017]",
  line: "border-white/[0.09]",
  lineStrong: "border-white/[0.14]",
  muted: "text-white/60",
  error: "text-[#F7849B]",
  accent: "text-[#B98BFF]",
}
const PURPLE = "#8504FE"

function Mark({ className = "h-4 w-4", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 184 184" className={className} style={style} aria-hidden>
      <path
        d="M173 87.961V116.631H127.763C115.793 116.631 106.038 126.488 106.038 138.488V184H77.5414V138.488C77.5414 118.517 89.2129 101.118 106.038 92.9322C112.641 89.7181 120.01 87.961 127.763 87.961H173Z"
        fill={PURPLE}
      />
      <path
        d="M10 96.9366V67.9984H55.6642C67.7467 67.9984 77.5932 58.0495 77.5932 45.9378V0H106.359V45.9378C106.359 66.0951 94.5776 83.657 77.5932 91.9189C70.9285 95.1631 63.4899 96.9366 55.6642 96.9366H10Z"
        fill={PURPLE}
      />
    </svg>
  )
}

/**
 * Progress sits in the ring. The Predict mark stays upright in the middle —
 * the same logo as the rest of the app, not turned with the fill.
 */
function ProgressRing({ fraction }: { fraction: number }) {
  const r = 19
  const circumference = 2 * Math.PI * r
  return (
    <div className="relative h-[44px] w-[44px] shrink-0">
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={PURPLE}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <LogoIcon className="pointer-events-none absolute top-1/2 left-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2" />
    </div>
  )
}

function list(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

// ── Drawings for the sliders ────────────────────────────────────────────────

/** A glass that fills with the number of glasses. */
function GlassArt({ fraction }: { fraction: number }) {
  // The inside of the glass runs from y=8 to y=66; keep a sliver even at the
  // bottom of the range so an empty-looking glass never reads as "no water".
  const top = 66 - (0.12 + 0.8 * fraction) * 58
  return (
    <svg viewBox="0 0 40 72" className="h-[68px] w-[38px]" aria-hidden>
      <defs>
        <clipPath id="glass-inside">
          <path d="M7 7 L33 7 L30 64 Q29.6 67 26.5 67 L13.5 67 Q10.4 67 10 64 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#glass-inside)">
        <rect x="0" y={top} width="40" height={72 - top} fill="#6D0FD6" style={{ transition: "y 250ms ease, height 250ms ease" }} />
        <path
          d={`M0 ${top} Q10 ${top - 2} 20 ${top} T40 ${top} V${top + 4} H0 Z`}
          fill="#9B4DFF"
          style={{ transition: "d 250ms ease" }}
        />
      </g>
      <path
        d="M5 5 L35 5 M7 7 L10 64 Q10.4 67 13.5 67 L26.5 67 Q29.6 67 30 64 L33 7"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Somebody asleep on their feet; the z's brighten with more sleep. */
function SleepArt({ fraction }: { fraction: number }) {
  const z = 0.35 + 0.65 * fraction
  return (
    <svg viewBox="0 0 48 64" className="h-[66px] w-[50px]" aria-hidden>
      <text x="33" y="12" fontSize="11" fontWeight="700" fill="#6A45C2" opacity={z}>
        z
      </text>
      <text x="27" y="21" fontSize="9" fontWeight="700" fill="#6A45C2" opacity={z}>
        z
      </text>
      <g fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="21" cy="30" r="7" />
        <path d="M17 29.5 h2.6 M22 30.5 h2.6" />
        <path d="M20.5 37 L19 47 M14 43 L19.8 40.5 L24 44.5 M19 47 L13.5 57 M19 47 L23 57" />
      </g>
      <path d="M8 59.5 H40" stroke="rgba(255,255,255,0.35)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// ── Inputs ──────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <p className={`mb-2.5 text-[13px] ${C.muted}`}>{children}</p>
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
 type="button"
 size="sm"
 variant={selected ? "default" : "outline"}
 aria-pressed={selected}
 onClick={onClick}
 className={`h-10 px-4 text-[14px] ${
 selected ? "text-white" : `${C.lineStrong} ${C.chip} border-white/14 bg-[#121017] text-white/90 hover:border-white/25 hover:bg-[#121017]`
 }`}
 >
      {children}
    </Button>
  )
}

function GridOption({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
 type="button"
 variant={selected ? "default" : "outline"}
 aria-pressed={selected}
 onClick={onClick}
 className={`h-11 font-mono text-[14px] ${
 selected ? "text-white" : `${C.chip} border-white/14 bg-[#121017] text-white/85 hover:border-white/25 hover:bg-[#121017]`
 }`}
 >
      {children}
    </Button>
  )
}

const RANGE =
  "mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none " +
  "[&::-webkit-slider-thumb]:h-[26px] [&::-webkit-slider-thumb]:w-[26px] [&::-webkit-slider-thumb]:appearance-none " +
  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#EDEDED] " +
  "[&::-webkit-slider-thumb]:shadow-[0_2px_10px_rgba(0,0,0,0.55)] " +
  "[&::-moz-range-thumb]:h-[26px] [&::-moz-range-thumb]:w-[26px] [&::-moz-range-thumb]:rounded-full " +
  "[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#EDEDED] [&::-moz-range-track]:bg-transparent " +
  "focus-visible:ring-2 focus-visible:ring-primary/60"

function Field({
  field,
  answers,
  flags,
  setAnswer,
  autoFocus,
}: {
  field: IntakeField
  answers: IntakeAnswers
  flags: IntakeFlags
  setAnswer: (key: string, value: string | string[]) => void
  autoFocus?: boolean
}) {
  const value = answers[field.key]

  if (field.kind === "insight") {
    // Only ever about a result the patient actually has.
    if (!insightApplies(field, flags)) return null
    return (
      <div className="rounded-xl border-l-[3px] border-primary bg-[#150A26] px-4 py-3.5 text-[13.5px] leading-relaxed text-white/90">
        Your <span className={C.accent}>{field.highlight}</span>. {field.text}
      </div>
    )
  }

  if (field.kind === "slider") {
    const touched = typeof value === "string" && value !== ""
    const n = touched ? Number(value) : field.start
    const fraction = (n - field.min) / (field.max - field.min)
    return (
      <div>
        <Label>{field.label}</Label>
        <div className={`flex items-center gap-5 rounded-full border ${C.lineStrong} ${C.field} px-5 py-5`}>
          <div className="flex w-[50px] shrink-0 justify-center">
            {field.art === "glass" ? <GlassArt fraction={fraction} /> : <SleepArt fraction={fraction} />}
          </div>
          <div className="min-w-0 flex-1">
            {/* Grey until it is moved: a slider always sits somewhere, and a
                position nobody chose is not an answer. */}
            <div className="flex items-baseline gap-2">
              <span className={`text-[34px] font-light leading-none ${touched ? "text-white" : "text-white/45"}`}>
                {n >= field.max ? field.maxLabel : n}
              </span>
              <span className={`text-[16px] ${touched ? "text-white/85" : "text-white/40"}`}>{field.unit}</span>
            </div>
            <input
              type="range"
              min={field.min}
              max={field.max}
              step={1}
              value={n}
              aria-label={field.label}
              aria-valuetext={`${n >= field.max ? field.maxLabel : n} ${field.unit}`}
              onChange={(e) => setAnswer(field.key, e.target.value)}
              className={RANGE}
              style={{
                background: `linear-gradient(to right, ${PURPLE} ${fraction * 100}%, rgba(255,255,255,0.12) ${fraction * 100}%)`,
              }}
            />
            <div className="mt-2.5 flex justify-between font-mono text-[12.5px] text-white/55">
              <span>{field.min}</span>
              <span>{field.maxLabel}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (field.kind === "number") {
    return (
      <div>
        <Label>{field.label}</Label>
        <label className={`flex h-12 items-center rounded-full border ${C.line} ${C.field} px-5 focus-within:border-white/25`}>
          <input
            inputMode="decimal"
            autoFocus={autoFocus}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => setAnswer(field.key, e.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
            placeholder={field.placeholder}
            aria-label={field.label}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/30"
          />
          <span className={`font-mono text-[12.5px] ${C.muted}`}>{field.unit}</span>
        </label>
      </div>
    )
  }

  if (field.kind === "text") {
    return (
      <div>
        {field.label && <Label>{field.label}</Label>}
        <input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => setAnswer(field.key, e.target.value)}
          placeholder={field.placeholder}
          aria-label={field.label || field.placeholder}
          className={`h-12 w-full rounded-full border ${C.line} ${C.field} px-5 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/25`}
        />
      </div>
    )
  }

  if (field.kind === "textarea") {
    return (
      <div>
        {field.label && <Label>{field.label}</Label>}
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => setAnswer(field.key, e.target.value)}
          placeholder={field.placeholder}
          aria-label={field.label || field.placeholder}
          rows={3}
          className={`w-full resize-none rounded-3xl border ${C.line} ${C.field} px-5 py-3 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-white/25`}
        />
      </div>
    )
  }

  if (field.kind === "meal") {
    return (
      <label className={`block rounded-3xl border ${C.line} ${C.field} px-5 py-3.5 focus-within:border-white/25`}>
        <span className="block text-[14px] font-medium text-white">{field.label}</span>
        <span className={`block text-[12px] ${C.muted}`}>{field.hint}</span>
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => setAnswer(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="mt-2 w-full resize-none bg-transparent text-[14.5px] leading-relaxed text-white outline-none placeholder:text-white/30"
        />
      </label>
    )
  }

  // single / multi
  if (field.kind !== "single" && field.kind !== "multi") return null
  const chosen = list(value)
  const toggle = (option: string) => {
    if (field.kind === "single") {
      setAnswer(field.key, chosen[0] === option ? "" : option)
      return
    }
    if (chosen.includes(option)) {
      setAnswer(field.key, chosen.filter((o) => o !== option))
    } else if (field.exclusive && option === field.exclusive) {
      // "None" means none: it cannot sit beside a problem.
      setAnswer(field.key, [option])
    } else {
      setAnswer(field.key, [...chosen.filter((o) => o !== field.exclusive), option])
    }
  }

  return (
    <div>
      {field.label && <Label>{field.label}</Label>}
      {field.grid ? (
        <div className="grid grid-cols-4 gap-2">
          {field.options.map((option) => (
            <GridOption key={option} selected={chosen.includes(option)} onClick={() => toggle(option)}>
              {option}
            </GridOption>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {field.options.map((option) => (
            <Chip key={option} selected={chosen.includes(option)} onClick={() => toggle(option)}>
              {option}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}

// ── The questionnaire ───────────────────────────────────────────────────────

export interface IntakeState {
  status: "draft" | "submitted"
  answers: IntakeAnswers
  resumeStep: number
  submittedAt?: string | null
}

export function PlanQuestionnaire({
  open,
  initial,
  prefill,
  flags,
  turnaroundHours,
  onClose,
  onSaved,
}: {
  open: boolean
  initial: IntakeState | null
  /** What the clinic already knows (age, sex), for a first go only. */
  prefill: IntakeAnswers
  /** The patient's out-of-range markers, for the notes tied to their report. */
  flags: IntakeFlags
  turnaroundHours: number
  onClose: () => void
  /** After every save, so the dashboard card reflects where things stand. */
  onSaved: (state: IntakeState) => void
}) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<IntakeAnswers>({})
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fresh each time it opens — and only then. Every Continue saves and hands
  // the parent a new record; resetting on that would throw the patient back
  // to the step they had just left, mid-questionnaire.
  // A draft reopens where it was left; a submitted one opens at the start
  // with its answers, for changing.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setAnswers(initial ? { ...initial.answers } : { ...prefill })
      setStep(initial?.status === "draft" ? initial.resumeStep : 0)
      setDone(false)
      setError(null)
    }
    wasOpen.current = open
  }, [open, initial, prefill])

  // The page behind should not scroll while this is up.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [step, done])

  const save = useCallback(
    async (nextStep: number, submit: boolean) => {
      const res = await fetch("/api/patient/intake", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers, step: nextStep, submit }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Your answers could not be saved.")
      onSaved(data.intake)
    },
    [answers, onSaved],
  )

  const close = useCallback(() => {
    // Closing halfway keeps what was typed. Fire and forget: the dialog
    // should not hang on the network to let somebody leave.
    if (!done) save(step, false).catch(() => {})
    onClose()
  }, [done, onClose, save, step])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, close])

  if (!open) return null

  const current = INTAKE_STEPS[step]!
  const last = step === INTAKE_STEP_COUNT - 1

  async function next() {
    const problem = intakeStepProblem(step, answers)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (last) {
        await save(step, true)
        setDone(true)
      } else {
        await save(step + 1, false)
        setStep(step + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your answers could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  function skip() {
    setError(null)
    save(step + 1, false).catch(() => {})
    setStep(step + 1)
  }

  const setAnswer = (key: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }))
    if (error) setError(null)
  }

  // "Step 2 of 8" is 25%: the ring shows how far along the step being
  // answered is, so the last step reads 100% as its Submit button appears.
  const fraction = done ? 1 : (step + 1) / INTAKE_STEP_COUNT
  const percent = Math.round(fraction * 100)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Personalised plan questionnaire"
        className={`relative flex h-full w-full flex-col ${C.surface} font-sans text-white sm:h-[min(820px,92vh)] sm:max-w-[420px] sm:rounded-[28px] sm:border ${C.line} sm:shadow-2xl`}
      >
        {/* Header — the ring is the progress bar now */}
        <div className="flex items-center gap-3.5 px-5 pb-2 pt-5">
          <ProgressRing fraction={fraction} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-medium leading-tight">{done ? "All done" : current.short}</p>
            <p className="mt-0.5 truncate font-mono text-[12px] text-white/50">
              {done
                ? `All ${INTAKE_STEP_COUNT} steps · answers sent`
                : `Step ${step + 1} of ${INTAKE_STEP_COUNT} · building your plan`}
            </p>
          </div>
          <span className={`shrink-0 font-mono text-[15px] ${C.accent}`} aria-label={`${percent} percent done`}>
            {percent}%
          </span>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-4">
          {done ? (
            <div className="flex flex-col items-center pt-12 text-center">
              <Mark className="h-12 w-12" />
              <h2 className="mt-6 text-[30px] font-light leading-tight">That&apos;s everything</h2>
              <p className={`mt-2 max-w-[300px] text-[13.5px] leading-relaxed ${C.muted}`}>
                Your answers are now paired with your blood report to make your diet and supplement plan.
              </p>
              <div className={`mt-6 w-full rounded-xl border ${C.line} ${C.field} p-4 text-left`}>
                <p className={`font-mono text-[10.5px] uppercase tracking-[0.18em] ${C.muted}`}>What happens next</p>
                <p className="mt-2 text-[14.5px] leading-relaxed">
                  Your plan shows on your dashboard as soon as your blood report is in. Your nutritionist reviews it
                  within {turnaroundHours} hours and may fine-tune it.
                </p>
                <Button type="button" variant="link" onClick={onClose} className={`mt-3 h-auto px-0 text-[13.5px] ${C.accent}`}>
                  See my plan →
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mt-6 text-[30px] font-light leading-[1.15]">{current.title}</h2>
              <p className={`mt-2 text-[14px] leading-relaxed ${C.muted}`}>{current.subtitle}</p>

              <div className="mt-6 flex flex-col gap-5">
                {current.fields
                  .filter((field) => isIntakeFieldVisible(field, answers))
                  .map((field, i) => (
                    <Field
                      key={field.key}
                      field={field}
                      answers={answers}
                      flags={flags}
                      setAnswer={setAnswer}
                      autoFocus={i === 0 && field.kind === "number" && !answers[field.key]}
                    />
                  ))}
              </div>

              {error && <p className={`mt-5 text-[13px] ${C.error}`}>{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div className="px-5 pb-5 pt-2">
            {current.skippable && !last && (
              <Button
 type="button"
 variant="ghost"
 onClick={skip}
 disabled={saving}
 className={`mb-3 h-auto w-full text-[13px] ${C.muted} hover:bg-transparent hover:text-white`}
 >
                Skip this step
              </Button>
            )}
            <div className="flex gap-3">
              {/* On the first step the back button's place closes instead —
                  there has to be a way out on a phone, where there is no
                  backdrop to tap. */}
              <Button
 type="button"
 size="icon-lg"
 variant="outline"
 onClick={() => (step === 0 ? close() : (setError(null), setStep(step - 1)))}
 aria-label={step === 0 ? "Close" : "Back"}
 className={`size-[50px] shrink-0 ${C.lineStrong} bg-transparent text-white/85 hover:border-white/30 hover:bg-white/5 hover:text-white`}
 >
                {step === 0 ? <X className="h-[18px] w-[18px]" /> : <ArrowLeft className="h-[18px] w-[18px]" />}
              </Button>
              <Button
 type="button"
 size="lg"
 onClick={next}
 disabled={saving}
 className="h-[50px] flex-1 text-[16px]"
 >
                {saving && <Loader2 className="size-4 animate-spin" />}
                {last ? "Submit" : "Continue"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

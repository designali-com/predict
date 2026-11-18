"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { PredictSpinner } from "@/src/components/predict-loader"
import { AlertTriangle, ChevronDown } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { INTAKE_STEP_COUNT, type IntakeAnswers, type IntakeFlags } from "@workspace/db/patient-intake"
import type { Diet, PersonalizedPlan } from "@workspace/db/diet-plan"
import { PlanQuestionnaire, type IntakeState } from "./plan-questionnaire"

interface IntakeResponse {
  intake: IntakeState | null
  plan: { plan: PersonalizedPlan; updatedAt: string } | null
  prefill: IntakeAnswers
  flags?: IntakeFlags
  turnaroundHours: number
  error?: string
}

const DIET_LABEL: Record<Diet, string> = {
  veg: "Vegetarian",
  egg: "Eggetarian",
  nonveg: "Non-vegetarian",
}

const MEALS = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snacks", label: "Snacks" },
] as const

/**
 * The Personalised Plan card's body.
 *
 * The plan is worked out from the patient's report and their questionnaire
 * (see diet-plan.ts for the rules) and shown once the questionnaire is
 * submitted. A nutritionist can then change any of it from the clinic panel;
 * this shows whatever was saved last, and says when a nutritionist has been
 * over it.
 */
export function PersonalizedPlanPanel({ domainCode }: { domainCode?: string }) {
  const [data, setData] = useState<IntakeResponse | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/patient/intake")
    const body = (await res.json().catch(() => null)) as IntakeResponse | null
    if (!res.ok || !body) {
      setUnavailable(body?.error ?? "Your plan is not available right now.")
      return
    }
    setUnavailable(null)
    setData(body)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onSaved = useCallback((intake: IntakeState) => {
    setData((prev) => (prev ? { ...prev, intake } : prev))
  }, [])

  const intake = data?.intake ?? null
  const plan = data?.plan?.plan ?? null
  const hours = data?.turnaroundHours ?? 48

  const questionnaire = data && (
    <PlanQuestionnaire
      open={open}
      initial={intake}
      prefill={data.prefill}
      flags={data.flags ?? {}}
      turnaroundHours={hours}
      onClose={() => {
        setOpen(false)
        // Submitting remakes the plan on the server; fetch the new one.
        load()
      }}
      onSaved={onSaved}
    />
  )

  if (!data || unavailable || !plan) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-8">
        {!data && !unavailable ? (
          <PredictSpinner />
        ) : unavailable ? (
          <p className="max-w-xs text-center text-xs text-muted-foreground">{unavailable}</p>
        ) : (
          <div className="flex max-w-xs flex-col items-center text-center">
            <p className="text-sm font-medium">
              {intake?.status === "submitted"
                ? "Answers received"
                : intake
                  ? "You're part-way through"
                  : "Nothing personalized yet"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {intake?.status === "submitted"
                ? "Your plan is made as soon as your blood report is in."
                : intake
                  ? `Pick up at step ${intake.resumeStep + 1} of ${INTAKE_STEP_COUNT} — your earlier answers are saved.`
                  : "Eight short questions about how you eat, sleep and live. With your blood report, they make your plan."}
            </p>
            <Button type="button" size="lg" className="mt-4 rounded-full px-6" onClick={() => setOpen(true)}>
              {intake?.status === "submitted"
                ? "Update my answers"
                : intake
                  ? "Continue my questionnaire"
                  : "Get your personalized plan"}
            </Button>
          </div>
        )}
        {questionnaire}
      </div>
    )
  }

  return (
    <>
      <PlanView plan={plan} domainCode={domainCode} />

      {/* A plan is only sent once the questionnaire is submitted, so this is
          always somebody changing answers they have already given. */}
      <Button variant="ghost" size="default"
 type="button"
 onClick={() => setOpen(true)}
 className="self-start text-xs text-primary underline-offset-4 hover:underline"
 >
        Update my answers
      </Button>

      {questionnaire}
    </>
  )
}

function PlanView({ plan, domainCode }: { plan: PersonalizedPlan; domainCode?: string }) {
  const [meal, setMeal] = useState<(typeof MEALS)[number]["key"]>("breakfast")

  // The selected domain's own advice first — the card is opened from a domain.
  const focus = useMemo(() => {
    const mine = plan.focus.filter((f) => domainCode && f.domains.includes(domainCode))
    const rest = plan.focus.filter((f) => !mine.includes(f))
    return [...mine, ...rest]
  }, [plan.focus, domainCode])

  const cautioned = plan.supplements.filter((s) => s.caution)

  return (
    <div className="flex flex-col gap-5">
      {plan.edited && (
        <span className="self-start rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
          Reviewed by your nutritionist ·{" "}
          {new Date(plan.edited.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        </span>
      )}

      {/* WHAT THE PLAN IS WORKING ON */}
      {plan.clusters.length > 0 && (
        <div className="flex flex-col gap-2">
          {plan.clusters.map((c) => (
            <div key={c.key} className="rounded-lg border-l-[3px] border-primary bg-primary/5 px-3 py-2.5">
              <p className="text-xs font-medium">{c.name}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {c.evidence.join(" · ")}. {c.suggests}
              </p>
            </div>
          ))}
        </div>
      )}

      {focus.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {/* The rules' own list is trimmed to the three that matter most;
              a nutritionist's is shown as they wrote it. */}
          {(plan.edited ? focus : focus.slice(0, 3)).map((f, i) => (
            <li key={`${f.key}-${i}`} className="flex gap-3 text-xs leading-relaxed">
              <span className="mt-0.5 text-primary">•</span>
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{f.title}. </span>
                {f.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* SUPPLEMENTS */}
      {plan.supplements.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {plan.supplements.map((s, i) => (
              <Badge
                key={`${s.name}-${i}`}
                variant="outline"
                title={s.reason}
                className="h-auto rounded-full px-4 py-2 font-normal whitespace-normal"
              >
                {s.name}
              </Badge>
            ))}
          </div>
          {cautioned.map((s, i) => (
            <p key={`${s.name}-${i}`}className="flex gap-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                {s.name}: {s.caution}
              </span>
            </p>
          ))}
          <p className="text-[11px] text-muted-foreground">Start supplements once your doctor confirms the dose.</p>
        </div>
      )}

      {/* MEALS */}
      <Tabs value={meal} onValueChange={(v) => setMeal(v as typeof meal)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          {MEALS.map((m) => (
            <TabsTrigger key={m.key} value={m.key} className="px-1 text-xs sm:text-sm">
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {MEALS.map((m) => (
          <TabsContent key={m.key} value={m.key} className="mt-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Choose one:</p>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {plan.diet ? DIET_LABEL[plan.diet] : "Vegetarian"}
                </span>
              </div>
              <ul className="flex flex-col gap-3">
                {plan.meals[m.key].map((item, i) => (
                  <li key={`${item}-${i}`}className="flex gap-3 text-xs leading-relaxed text-muted-foreground">
                    <span className="mt-0.5 text-primary">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* EVERYTHING ELSE, folded so the meals stay the first thing seen */}
      {(plan.avoid.length > 0 || plan.habits.length > 0 || plan.cautions.length > 0) && (
        <details className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-medium">
            What to avoid, and daily habits
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-4 border-t px-4 py-3">
            {plan.avoid.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Cut down on</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {plan.avoid.map((a, i) => (
                    <li key={`${a}-${i}`}className="flex gap-3 text-xs leading-relaxed text-muted-foreground">
                      <span className="mt-0.5 text-destructive">×</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {plan.habits.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Daily habits</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {plan.habits.map((h, i) => (
                    <li key={`${h}-${i}`}className="flex gap-3 text-xs leading-relaxed text-muted-foreground">
                      <span className="mt-0.5 text-primary">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {plan.cautions.map((c, i) => (
              <p key={`${c}-${i}`}className="flex gap-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{c}</span>
              </p>
            ))}
          </div>
        </details>
      )}

      {/* DRINK */}
      {plan.drink && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Drink:</span> {plan.drink}
          </p>
        </div>
      )}
    </div>
  )
}

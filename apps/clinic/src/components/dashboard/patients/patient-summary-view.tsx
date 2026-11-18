"use client"

import type { CSSProperties, ReactNode } from "react"
import {
  Activity,
  Apple,
  ClipboardCheck,
  Dumbbell,
  Footprints,
  Gauge,
  HeartPulse,
  Ruler,
  Scale,
  Stethoscope,
  Target,
  TrendingDown,
  Zap,
} from "lucide-react"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { PatientSummary, SidePair, Stat, Tone } from "@workspace/db/patient-summary"

/**
 * The assessment on one screen, for the doctor to walk the patient through:
 * why they came, how it hurts, what was measured, how the sides compare, what
 * the DynaMo found — then the plan.
 *
 * Drawn with the panel's own theme tokens, so it sits in light and dark like
 * every other card; the clinic's colour is the accent. --brand is the colour
 * itself, --brand-ink the same colour made readable on the current background
 * (a dark green is lifted towards white in dark mode). Printing is always
 * light — see the page at /summary/[id].
 */

const FALLBACK = "#8504FE"

const TONE: Record<Tone, { chip: string; dot: string; tile: string; label: string }> = {
  good: {
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    tile: "bg-emerald-500/[0.07] ring-emerald-500/20",
    label: "Good",
  },
  fair: {
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    tile: "bg-amber-500/[0.07] ring-amber-500/25",
    label: "Watch",
  },
  poor: {
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    dot: "bg-rose-500",
    tile: "bg-rose-500/[0.07] ring-rose-500/25",
    label: "Needs care",
  },
  neutral: { chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50", tile: "bg-muted/60 ring-border", label: "" },
}

const TONE_HEX: Record<Tone, string> = { good: "#10b981", fair: "#f59e0b", poor: "#f43f5e", neutral: "#94a3b8" }

const short = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

/** "SLR(P) — straight leg raise, prone" → code "SLR(P)", what "Straight leg raise, prone". */
function split(label: string): { code: string; what: string } {
  const [code, ...rest] = label.split(" — ")
  const what = rest.join(" — ")
  return what ? { code: code!, what: what.charAt(0).toUpperCase() + what.slice(1) } : { code: "", what: label }
}

function asymTone(pct: number | null): Tone {
  if (pct == null) return "neutral"
  if (pct >= 15) return "poor"
  if (pct >= 10) return "fair"
  return "good"
}

/** WOMAC: the higher, the worse. */
function womacTone(pct: number | null): Tone {
  if (pct == null) return "neutral"
  if (pct >= 50) return "poor"
  if (pct >= 25) return "fair"
  return "good"
}

/** A few cm or degrees either way is a big percentage of a small number — not worth a flag. */
const meaningful = (l: number | null, r: number | null) => Math.max(Math.abs(l ?? 0), Math.abs(r ?? 0)) >= 20

function Card({
  title,
  icon: Icon,
  children,
  className = "",
  aside,
}: {
  title: string
  icon: typeof Activity
  children: ReactNode
  className?: string
  aside?: ReactNode
}) {
  return (
    <section className={`break-inside-avoid rounded-xl ps-glass p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--brand-ink)_16%,transparent)] text-[var(--brand-ink)]">
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </h3>
        {aside && <span className="text-[11px] text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function Chip({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "rose" | "muted" }) {
  const cls =
    tone === "rose"
      ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
      : tone === "muted"
        ? "bg-muted text-foreground/80"
        : "bg-[color-mix(in_srgb,var(--brand-ink)_16%,transparent)] text-[var(--brand-ink)]"
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${cls}`}>{children}</span>
}

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const t = TONE[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {children}
    </span>
  )
}

function Kpi({ label, value, unit, note, tone, icon: Icon }: { label: string; value: string; unit?: string; note?: string; tone: Tone; icon: typeof Activity }) {
  return (
    <div className="break-inside-avoid rounded-xl ps-glass p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--brand-ink)_16%,transparent)] text-[var(--brand-ink)]">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </p>
      <div className="mt-1.5 h-5">{(note || TONE[tone].label) && <Badge tone={tone}>{note || TONE[tone].label}</Badge>}</div>
    </div>
  )
}

function StatTile({ s }: { s: Stat }) {
  return (
    <div className={`rounded-lg p-3 ring-1 ring-inset ${TONE[s.tone].tile}`}>
      <p className="text-[11px] text-muted-foreground">{s.label}</p>
      <p className="mt-0.5 text-lg font-semibold">
        {s.value}
        {s.unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{s.unit}</span>}
      </p>
      {s.note && <p className={`text-[11px] font-medium ${s.tone === "neutral" ? "text-muted-foreground" : TONE[s.tone].chip.split(" ").slice(1).join(" ")}`}>{s.note}</p>}
    </div>
  )
}

/** Where a BMI sits on the Asian scale — a bar with a marker. */
function BmiScale({ bmi }: { bmi: number }) {
  const min = 15
  const max = 35
  const pos = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100
  const bands: [number, number, string][] = [
    [15, 18.5, "bg-amber-400/80"],
    [18.5, 23, "bg-emerald-500/80"],
    [23, 25, "bg-amber-400/80"],
    [25, 35, "bg-rose-500/70"],
  ]
  return (
    <div className="mt-5">
      <div className="relative h-2 rounded-full">
        <div className="flex h-full gap-0.5 overflow-hidden rounded-full">
          {bands.map(([from, to, cls]) => (
            <div key={from} className={cls} style={{ width: `${pos(to) - pos(from)}%` }} />
          ))}
        </div>
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card bg-foreground shadow"
          style={{ left: `${pos(bmi)}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-4 text-[10px] text-muted-foreground">
        <span>Under 18.5</span>
        <span className="text-center">Healthy</span>
        <span className="text-center">23–25</span>
        <span className="text-right">Obese 25+</span>
      </div>
    </div>
  )
}

interface Row {
  label: string
  sub?: string
  unit: string
  left: number | null
  right: number | null
  asymmetry: number | null
}

/** Left and right, mirrored from the centre, with the difference between them. */
function Butterfly({ rows }: { rows: Row[] }) {
  const peak = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.left ?? 0), Math.abs(r.right ?? 0)]))
  const width = (v: number | null) => `${Math.max(2, (Math.abs(v ?? 0) / peak) * 100)}%`
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-[1fr_6.5rem_1fr] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-right">Left</span>
        <span />
        <span>Right</span>
      </div>
      {rows.map((r, i) => {
        const tone = meaningful(r.left, r.right) ? asymTone(r.asymmetry) : "neutral"
        return (
          <div key={i} className="break-inside-avoid">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-medium">
                {r.label}
                {r.sub && <span className="ml-1.5 font-normal text-muted-foreground">{r.sub}</span>}
              </p>
              {r.asymmetry != null && <Badge tone={tone}>{r.asymmetry}%</Badge>}
            </div>
            <div className="grid grid-cols-[1fr_6.5rem_1fr] items-center">
              <div className="flex h-2.5 justify-end rounded-l-full bg-muted">
                <div className="rounded-l-full bg-[color-mix(in_srgb,var(--brand-ink)_45%,transparent)]" style={{ width: width(r.left) }} />
              </div>
              <div className="whitespace-nowrap text-center text-xs font-semibold tabular-nums">
                {r.left ?? "—"}
                <span className="mx-1 font-normal text-muted-foreground">·</span>
                {r.right ?? "—"}
                <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{r.unit}</span>
              </div>
              <div className="flex h-2.5 rounded-r-full bg-muted">
                <div className="rounded-r-full bg-[var(--brand-ink)]" style={{ width: width(r.right) }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const RING = 46
const CIRCUMFERENCE = 2 * Math.PI * RING

/** A WOMAC subscale as a ring — plain SVG, so it draws on the server and in print. */
function Ring({ label, value }: { label: string; value: number | null }) {
  const color = TONE_HEX[womacTone(value)]
  const filled = (Math.min(100, Math.max(0, value ?? 0)) / 100) * CIRCUMFERENCE
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90">
          <circle cx="52" cy="52" r={RING} fill="none" className="stroke-muted" strokeWidth="9" />
          <circle cx="52" cy="52" r={RING} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${filled} ${CIRCUMFERENCE}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold">{value == null ? "—" : Math.round(value)}</span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/**
 * The glass: cards half see-through over the clinic-coloured backdrop, blurred
 * behind. Print drops it for plain white cards — blur and tint do not print.
 */
const GLASS_CSS = `
.patient-summary{--brand-ink:var(--brand);--glass:color-mix(in srgb,var(--card) 58%,transparent);--glass-edge:color-mix(in srgb,white 70%,transparent)}
.dark .patient-summary{--brand-ink:color-mix(in srgb,var(--brand) 40%,white);--glass:color-mix(in srgb,var(--card) 45%,transparent);--glass-edge:rgb(255 255 255 / 0.09)}
.patient-summary .ps-glass{background:var(--glass);border:1px solid var(--glass-edge);-webkit-backdrop-filter:blur(20px) saturate(160%);backdrop-filter:blur(20px) saturate(160%);box-shadow:0 1px 2px rgb(0 0 0 / 0.04)}
.patient-summary .ps-glass-soft{background:color-mix(in srgb,var(--card) 40%,transparent);border:1px solid var(--glass-edge)}
@media print{
  .patient-summary,.patient-summary *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .patient-summary .ps-glass,.patient-summary .ps-glass-soft{background:var(--card);border-color:var(--border);box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}
}
`

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

export function PatientSummaryView({ summary: s, actions }: { summary: PatientSummary; actions?: ReactNode }) {
  const brand = s.clinic?.brandColor || FALLBACK
  const style = { "--brand": brand } as CSSProperties

  const bmiStat = s.body.find((b) => b.label === "BMI")
  const bmiValue = bmiStat ? Number(bmiStat.value) : null
  const worstSide = [
    ...s.sides.filter((x) => meaningful(x.left, x.right)).map((x) => x.asymmetry),
    ...s.vald.filter((v) => meaningful(v.left, v.right)).map((v) => v.asymmetry ?? 0),
  ].reduce((a, b) => Math.max(a, b), 0)
  const worstRegion = [...s.pain.regions].sort((a, b) => b.score - a.score)[0]
  const adherence = s.exercise.adherence
  const asked = adherence ? adherence.done + adherence.partial + adherence.missed : 0
  const adherencePct = adherence && asked ? Math.round(((adherence.done + adherence.partial * 0.5) / asked) * 100) : null
  const hasWhy = s.complaints.complaints.length > 0 || s.complaints.painAreas.length > 0 || !!s.complaints.duration

  const nothing = !s.lastVisit && s.vald.length === 0 && !s.exercise.plan && !s.exercise.current && !s.diet && s.diagnosis.conditions.length === 0

  const sideRows: Row[] = s.sides.slice(0, 8).map((x: SidePair) => {
    const { code, what } = split(x.label)
    return { label: what, sub: code, unit: x.unit, left: x.left, right: x.right, asymmetry: x.asymmetry }
  })
  const valdRows: Row[] = s.vald.map((v) => ({
    label: v.label,
    sub: v.kind === "rom" ? "Mobility" : "Strength",
    unit: v.unit,
    left: v.left,
    right: v.right,
    asymmetry: v.asymmetry,
  }))

  return (
    <div className="patient-summary flex flex-col gap-4 text-foreground" style={style}>
      {/* --brand-ink: the clinic colour, lifted towards white on a dark background so it stays readable. */}
      <style>{GLASS_CSS}</style>

      {/* Header — who, and the last visit */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {s.clinic?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.clinic.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full bg-white object-contain p-1 ring-1 ring-border" />
          )}
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight">{s.patient.name}</h2>
            <p className="text-xs text-muted-foreground">
              {[
                s.patient.age != null ? `${s.patient.age} yrs` : null,
                s.patient.gender ? s.patient.gender.charAt(0) + s.patient.gender.slice(1).toLowerCase() : null,
                s.patient.code,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        {actions}
      </header>

      {nothing ? (
        <div className="ps-glass rounded-xl p-10 text-center text-sm text-muted-foreground">
          Nothing recorded yet. Fill the visit forms, run the VALD tests and prescribe — the summary builds itself from them.
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
            {s.pain.womac ? (
              <Kpi label="Pain & function (WOMAC)" value={String(Math.round(s.pain.womac.total ?? 0))} unit="/ 100" tone={womacTone(s.pain.womac.total)} icon={Activity} />
            ) : worstRegion ? (
              <Kpi label="Worst pain" value={worstRegion.region} note={worstRegion.answer} tone={worstRegion.score >= 3 ? "poor" : worstRegion.score >= 2 ? "fair" : "good"} icon={Activity} />
            ) : (
              <Kpi label="Pain areas" value={String(s.complaints.painAreas.length || "—")} note={s.complaints.duration ? `For ${s.complaints.duration}` : undefined} tone="neutral" icon={Activity} />
            )}
            {bmiStat ? (
              <Kpi label="Body mass index" value={bmiStat.value} note={bmiStat.note} tone={bmiStat.tone} icon={Scale} />
            ) : (
              <Kpi label="Conditions found" value={String(s.diagnosis.conditions.length || "—")} tone="neutral" icon={Stethoscope} />
            )}
            <Kpi
              label="Left vs right"
              value={worstSide ? `${worstSide}%` : "—"}
              note={worstSide ? (worstSide >= 15 ? "Big difference" : worstSide >= 10 ? "Some difference" : "Balanced") : "Not measured"}
              tone={worstSide ? asymTone(worstSide) : "neutral"}
              icon={Gauge}
            />
            {adherencePct != null ? (
              <Kpi label="Exercise kept up · 30 days" value={`${adherencePct}%`} note={`${asked} check-ins`} tone={adherencePct >= 75 ? "good" : adherencePct >= 40 ? "fair" : "poor"} icon={Dumbbell} />
            ) : (
              <Kpi
                label="Exercise plan"
                value={s.exercise.plan ? String(s.exercise.plan.exercises.length) : "—"}
                unit={s.exercise.plan ? "exercises" : undefined}
                note={s.exercise.plan ? (s.exercise.plan.active ? "Active" : "Draft") : "Not prescribed"}
                tone={s.exercise.plan?.active ? "good" : "neutral"}
                icon={Dumbbell}
              />
            )}
          </div>

          {/* Why they came · what was found */}
          {(hasWhy || s.diagnosis.conditions.length > 0 || s.diagnosis.notes) && (
            <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
              {hasWhy && (
                <Card title="Why you came" icon={Target}>
                  <div className="flex flex-col gap-4">
                    {(s.complaints.complaints.length > 0 || s.complaints.locations.length > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {s.complaints.complaints.map((c) => (
                          <Chip key={c}>{c}</Chip>
                        ))}
                        {s.complaints.locations.map((c) => (
                          <Chip key={c} tone="muted">
                            {c}
                          </Chip>
                        ))}
                      </div>
                    )}
                    {s.complaints.painAreas.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Where it hurts</p>
                        <div className="flex flex-wrap gap-1.5">
                          {s.complaints.painAreas.map((c) => (
                            <Chip key={c} tone="rose">
                              {c}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    )}
                    {(s.complaints.duration || s.complaints.triggers.length > 0) && (
                      <dl className="grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-2">
                        {s.complaints.duration && (
                          <div>
                            <dt className="text-[11px] text-muted-foreground">Suffering for</dt>
                            <dd className="font-medium">{s.complaints.duration}</dd>
                          </div>
                        )}
                        {s.complaints.triggers.length > 0 && (
                          <div>
                            <dt className="text-[11px] text-muted-foreground">Worse with</dt>
                            <dd className="font-medium">{s.complaints.triggers.join(", ")}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                </Card>
              )}
              <Card title="What we found" icon={Stethoscope} className={hasWhy ? "" : "lg:col-span-2 print:col-span-2"}>
                {s.diagnosis.conditions.length ? (
                  <ul className="flex flex-col divide-y divide-border">
                    {s.diagnosis.conditions.map((c) => (
                      <li key={c} className="flex items-start gap-2.5 py-2 text-sm font-medium first:pt-0">
                        <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-ink)]" />
                        {c}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>No diagnosis recorded yet.</Empty>
                )}
                {s.diagnosis.notes && <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm leading-relaxed text-foreground/80">{s.diagnosis.notes}</p>}
              </Card>
            </div>
          )}

          {/* Pain */}
          {(s.pain.womac || s.pain.regions.length > 0) && (
            <Card title="Pain profile" icon={Zap} aside={s.pain.womac ? "WOMAC — lower is better" : undefined}>
              <div className="grid items-center gap-6 lg:grid-cols-[auto_1fr] print:grid-cols-[auto_1fr]">
                {s.pain.womac && (
                  <div className="flex flex-wrap justify-center gap-5">
                    <Ring label="Pain" value={s.pain.womac.pain} />
                    <Ring label="Stiffness" value={s.pain.womac.stiffness} />
                    <Ring label="Daily activities" value={s.pain.womac.function} />
                  </div>
                )}
                {s.pain.regions.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {s.pain.regions.map((r) => {
                      const color = r.score >= 3 ? "bg-rose-500" : r.score === 2 ? "bg-amber-500" : "bg-emerald-500"
                      return (
                        <div key={r.region} className="grid grid-cols-[7rem_1fr_6rem] items-center gap-3 text-xs">
                          <span className="font-medium">{r.region}</span>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4].map((n) => (
                              <div key={n} className={`h-2 flex-1 rounded-full ${n <= r.score ? color : "bg-muted"}`} />
                            ))}
                          </div>
                          <span className="text-right text-muted-foreground">{r.answer}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Vitals · body */}
          {(s.vitals.length > 0 || s.body.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
              {s.vitals.length > 0 && (
                <Card title="Vital signs" icon={HeartPulse} className={s.body.length ? "" : "lg:col-span-2 print:col-span-2"}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {s.vitals.map((v) => (
                      <StatTile key={v.label} s={v} />
                    ))}
                  </div>
                </Card>
              )}
              {s.body.length > 0 && (
                <Card title="Body composition" icon={Ruler} className={s.vitals.length ? "" : "lg:col-span-2 print:col-span-2"}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {s.body.map((v) => (
                      <StatTile key={v.label} s={v} />
                    ))}
                  </div>
                  {bmiValue != null && Number.isFinite(bmiValue) && <BmiScale bmi={bmiValue} />}
                </Card>
              )}
            </div>
          )}

          {/* Sides · DynaMo */}
          {(sideRows.length > 0 || valdRows.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
              {sideRows.length > 0 && (
                <Card title="Left vs right" icon={Ruler} aside="Clinic measurements" className={valdRows.length ? "" : "lg:col-span-2 print:col-span-2"}>
                  <Butterfly rows={sideRows} />
                </Card>
              )}
              {valdRows.length > 0 && (
                <Card title="Strength & mobility" icon={Gauge} aside="DynaMo · latest of each" className={sideRows.length ? "" : "lg:col-span-2 print:col-span-2"}>
                  <Butterfly rows={valdRows} />
                </Card>
              )}
            </div>
          )}

          {/* Trend */}
          {s.trend.length >= 2 && (
            <Card title="Progress over visits" icon={TrendingDown} aside="WOMAC · weight">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={s.trend.map((t) => ({ ...t, label: short(t.date) }))} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.55 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="w" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.55 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="kg" orientation="right" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.55 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }}
                    />
                    <Line yAxisId="w" type="monotone" dataKey="womac" name="WOMAC" stroke="var(--brand-ink)" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                    <Line yAxisId="kg" type="monotone" dataKey="weight" name="Weight (kg)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* The plan */}
          {(s.exercise.current || s.exercise.plan || s.diet) && (
            <Card title="Your plan" icon={ClipboardCheck}>
              <div className="grid gap-3 lg:grid-cols-3 print:grid-cols-1">
                <div className="ps-glass-soft rounded-lg p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Footprints className="h-3.5 w-3.5" /> What you do now
                  </p>
                  {s.exercise.current && (s.exercise.current.activityLevel || s.exercise.current.activities.length) ? (
                    <div className="mt-3 flex flex-col gap-2 text-sm">
                      {s.exercise.current.activityLevel && <p className="font-semibold">{s.exercise.current.activityLevel}</p>}
                      {s.exercise.current.activities.map((a, i) => (
                        <div key={i} className="flex items-start justify-between gap-2">
                          <span>
                            <span className="font-medium">{a.name}</span>
                            <span className="block text-xs text-muted-foreground">{[a.frequency, a.duration].filter(Boolean).join(" · ")}</span>
                          </span>
                          {a.painDuring === "Yes" && <Badge tone="poor">Hurts</Badge>}
                          {a.painDuring === "Sometimes" && <Badge tone="fair">Sometimes hurts</Badge>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3">
                      <Empty>Not recorded.</Empty>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[color-mix(in_srgb,var(--brand-ink)_35%,transparent)] bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-ink)]">
                    <Dumbbell className="h-3.5 w-3.5" /> Exercise prescription
                  </p>
                  {s.exercise.plan ? (
                    <div className="mt-3">
                      <p className="font-semibold">{s.exercise.plan.title}</p>
                      <p className="text-xs text-muted-foreground">{[s.exercise.plan.duration, s.exercise.plan.schedule].filter(Boolean).join(" · ")}</p>
                      <ol className="mt-3 flex flex-col gap-1.5">
                        {s.exercise.plan.exercises.slice(0, 8).map((e, i) => (
                          <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate">
                              <span className="mr-1.5 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                              {e.name}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{e.dose}</span>
                          </li>
                        ))}
                      </ol>
                      {s.exercise.plan.exercises.length > 8 && <p className="mt-1 text-xs text-muted-foreground">+ {s.exercise.plan.exercises.length - 8} more</p>}
                      {adherence && asked > 0 && (
                        <div className="mt-3">
                          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="bg-emerald-500" style={{ width: `${(adherence.done / asked) * 100}%` }} />
                            <div className="bg-amber-500" style={{ width: `${(adherence.partial / asked) * 100}%` }} />
                            <div className="bg-rose-500" style={{ width: `${(adherence.missed / asked) * 100}%` }} />
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {adherence.done} done · {adherence.partial} partly · {adherence.missed} missed
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3">
                      <Empty>Not prescribed yet.</Empty>
                    </div>
                  )}
                </div>

                <div className="ps-glass-soft rounded-lg p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Apple className="h-3.5 w-3.5" /> Diet plan
                  </p>
                  {s.diet ? (
                    <div className="mt-3">
                      <p className="font-semibold">{s.diet.title}</p>
                      {s.diet.badge && <p className="text-xs text-muted-foreground">{s.diet.badge}</p>}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {s.diet.diet && <Chip>{s.diet.diet === "veg" ? "Vegetarian" : s.diet.diet === "egg" ? "Eggetarian" : "Non-vegetarian"}</Chip>}
                        {s.diet.meals > 0 && <Chip tone="muted">{s.diet.meals} meals a day</Chip>}
                      </div>
                      {s.diet.avoid.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">Avoid</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">{s.diet.avoid.join(" · ")}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3">
                      <Empty>Not planned yet.</Empty>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

"use client"

import { Button } from "@workspace/ui/components/button"

import Link from "next/link"
import { Activity, CalendarDays, Dumbbell, Gauge, Printer, Scale, Timer, TriangleAlert, User } from "lucide-react"
import { ValdReportChart, type ReportPoint } from "./vald-report-chart"
import type { ValdReport } from "@/src/lib/vald/report"

const G = 9.80665

/**
 * Dates are printed in the clinic's own zone, always.
 *
 * Without pinning it, a test recorded just after midnight in Delhi prints as
 * the previous day on any machine that is not set to IST — including whatever
 * renders this on the server.
 */
const ZONE = "Asia/Kolkata"

/** A clinic day, already a plain date string. Parsed as noon so it cannot slip. */
function whenDay(day: string): string {
  return new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONE,
  })
}

function when(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONE,
  })
}

function stamp(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: ZONE,
  })
}

function num(value: number | null | undefined, decimals: number): string {
  return value == null ? "—" : value.toFixed(decimals)
}

/** Strength is reported in kilograms; the device measures newtons. */
const kg = (n: number | null | undefined) => (n == null ? null : n / G)

const RANGE_WORDS: Record<string, string> = {
  day: "Single session",
  week: "Past week",
  all: "Complete history",
}

/**
 * The muscle strength report a patient is handed.
 *
 * Printed through the browser rather than generated as a PDF, the same way
 * receipts are: it reaches every printer the clinic owns, gives Save as PDF on
 * every platform for free, and keeps the numbers as selectable text instead of
 * flattening them into a picture.
 */
export function ValdReportView({ report }: { report: ValdReport }) {
  const { clinic, patient, summary } = report

  const address = [
    clinic.addressLine1,
    clinic.addressLine2,
    [clinic.city, clinic.state].filter(Boolean).join(", "),
    clinic.pincode,
  ]
    .filter(Boolean)
    .join(", ")

  const contactLine = [clinic.phone && `Ph ${clinic.phone}`, clinic.email, clinic.website]
    .filter(Boolean)
    .join("  ·  ")

  const period =
    report.fromDay && report.toDay
      ? report.fromDay === report.toDay
        ? whenDay(report.fromDay)
        : `${whenDay(report.fromDay)} to ${whenDay(report.toDay)}`
      : "No tests on record"

  return (
    <div className="min-h-screen bg-black/[0.04] py-6 print:bg-white print:py-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
          html, body { background: #fff !important; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          /* Chrome drops colour from printed artwork unless told not to, which
             would put a grey smudge where the logo is. */
          img { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["day", "week", "all"] as const).map((r) => (
            <Link
              key={r}
              href={`?range=${r}`}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                report.range === r
                  ? "border-black bg-black text-white"
                  : "border-black/20 text-black/70 hover:bg-black/5"
              }`}
            >
              {RANGE_WORDS[r]}
            </Link>
          ))}
          <Button variant="default" size="default"
 onClick={() => window.print()}

 >
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {report.missing.length > 0 && (
        <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-start gap-2 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The clinic&apos;s {report.missing.join(", ")}{" "}
            {report.missing.length === 1 ? "is" : "are"} not filled in, so{" "}
            {report.missing.length === 1 ? "it prints" : "they print"} blank. Add{" "}
            {report.missing.length === 1 ? "it" : "them"} under{" "}
            <Link href="/settings" className="font-semibold underline">
              Settings → Clinic details
            </Link>
            .
          </span>
        </div>
      )}

      <div className="mx-auto max-w-[210mm] bg-white p-8 text-black shadow-sm print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-black pb-4">
          <div className="flex items-start gap-3">
            {/* A plain img, not next/image: this page exists to be printed, and
                lazy loading plus a generated srcset is a good way to hand
                somebody a report with a blank square where the logo was. */}
            <img
              src="/logo-icon.png"
              alt=""
              width={72}
              height={72}
              className="h-[72px] w-[72px] shrink-0"
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{clinic.name}</h1>
              {clinic.legalName && clinic.legalName !== clinic.name && (
                <p className="text-sm text-black/70">{clinic.legalName}</p>
              )}
              {address && (
                <p className="mt-1 max-w-md text-xs leading-relaxed text-black/70">{address}</p>
              )}
              {contactLine && <p className="mt-0.5 text-xs text-black/70">{contactLine}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1.5 text-[11px] font-semibold tracking-widest text-black/60 uppercase">
              <Activity className="h-3.5 w-3.5" />
              Muscle strength report
            </p>
            <p className="mt-1 text-sm font-semibold">{RANGE_WORDS[report.range]}</p>
            <p className="text-xs text-black/70">{period}</p>
          </div>
        </header>

        <section className="mt-4 grid gap-x-6 gap-y-1 border-b border-black/15 pb-4 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-2">
            <User className="h-4 w-4 shrink-0 text-black/50" />
            <span className="font-semibold">{patient.name}</span>
          </p>
          <p className="text-black/75 sm:text-right">
            {patient.code && <span className="font-mono">{patient.code}</span>}
            {patient.age != null && <span> · {patient.age} yrs</span>}
            {patient.sex && <span> · {patient.sex}</span>}
          </p>
          {patient.phone && <p className="text-xs text-black/70">Ph {patient.phone}</p>}
        </section>

        {report.muscle && report.muscle.muscleAge != null && (
          <MuscleAgeBox muscle={report.muscle} />
        )}

        {report.groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-black/60">
            No tests fall in this window.
            {report.totalOnRecord > 0 &&
              ` This patient has ${report.totalOnRecord} test${report.totalOnRecord === 1 ? "" : "s"} on record — choose the complete history instead.`}
          </p>
        ) : (
          <>
            <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat icon={<Dumbbell className="h-4 w-4" />} label="Tests" value={String(summary.testCount)} />
              <Stat
                icon={<Activity className="h-4 w-4" />}
                label="Movements"
                value={String(summary.movementCount)}
              />
              <Stat
                icon={<CalendarDays className="h-4 w-4" />}
                label="Session days"
                value={String(summary.sessionDays)}
              />
              <Stat
                icon={<Scale className="h-4 w-4" />}
                label="Avg difference"
                value={summary.averageAsymmetry == null ? "—" : `${summary.averageAsymmetry.toFixed(1)}%`}
                warn={summary.averageAsymmetry != null && summary.averageAsymmetry >= 15}
              />
            </section>

            {report.groups.map((group) => {
              const rom = group.category === "RangeofMotion"
              const sorted = [...group.tests].sort(
                (a, b) => new Date(a.testedAt).getTime() - new Date(b.testedAt).getTime(),
              )
              const points: ReportPoint[] = sorted.map((t) => ({
                date: t.testedAt,
                left: rom ? (t.left?.rangeOfMotionDegrees ?? null) : kg(t.left?.peakForceNewtons),
                right: rom ? (t.right?.rangeOfMotionDegrees ?? null) : kg(t.right?.peakForceNewtons),
              }))

              return (
                <section key={group.key} className="avoid-break mt-6">
                  <h2 className="flex items-center gap-2 border-b border-black/15 pb-1.5 text-base font-semibold">
                    {rom ? <Gauge className="h-4 w-4" /> : <Dumbbell className="h-4 w-4" />}
                    {group.title}
                    <span className="ml-auto text-xs font-normal text-black/55">
                      {group.tests.length} test{group.tests.length === 1 ? "" : "s"}
                    </span>
                  </h2>

                  <div className="mt-3">
                    <ValdReportChart
                      points={points}
                      unit={rom ? "degrees" : "kg"}
                      label={rom ? "Range of motion" : "Peak force"}
                      decimals={rom ? 0 : 1}
                    />
                  </div>

                  <table className="mt-3 w-full text-[11px]">
                    <thead>
                      <tr className="border-y border-black/15 text-left tracking-wider text-black/55 uppercase">
                        <th className="py-1.5 font-semibold">Date</th>
                        {rom ? (
                          <th className="py-1.5 text-right font-semibold">Range of motion (°)</th>
                        ) : (
                          <>
                            <th className="py-1.5 text-right font-semibold">Peak force (kg)</th>
                            <th className="py-1.5 text-right font-semibold">Peak RFD (kg/s)</th>
                            <th className="py-1.5 text-right font-semibold">Time to peak (s)</th>
                            <th className="py-1.5 text-right font-semibold">Impulse (kg·s)</th>
                          </>
                        )}
                        <th className="py-1.5 text-right font-semibold">{rom ? "Of normal" : "Muscle age"}</th>
                        <th className="py-1.5 text-right font-semibold">Difference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {[...sorted].reverse().map((t) => (
                        <tr key={t.id}>
                          <td className="py-1.5 whitespace-nowrap">{when(t.testedAt)}</td>
                          {rom ? (
                            <td className="py-1.5 text-right tabular-nums">
                              {num(t.left?.rangeOfMotionDegrees, 0)} / {num(t.right?.rangeOfMotionDegrees, 0)}
                            </td>
                          ) : (
                            <>
                              <td className="py-1.5 text-right tabular-nums">
                                {num(kg(t.left?.peakForceNewtons), 1)} / {num(kg(t.right?.peakForceNewtons), 1)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {num(kg(t.left?.peakRfdNewtonsPerSecond), 0)} / {num(kg(t.right?.peakRfdNewtonsPerSecond), 0)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {num(t.left?.timeToPeakForceSeconds, 2)} / {num(t.right?.timeToPeakForceSeconds, 2)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {num(kg(t.left?.impulseNewtonSeconds), 1)} / {num(kg(t.right?.impulseNewtonSeconds), 1)}
                              </td>
                            </>
                          )}
                          <td className="py-1.5 text-right tabular-nums">
                            {rom
                              ? t.romPercentOfNormal == null
                                ? "—"
                                : `${Math.round(t.romPercentOfNormal)}%`
                              : t.muscleAge == null
                                ? "—"
                                : `${Math.round(t.muscleAge)} yrs${t.strengthPercentile != null ? ` · ${ordinal(t.strengthPercentile)} pct` : ""}`}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {t.asymmetryPercent == null ? (
                              "—"
                            ) : (
                              <span
                                className={
                                  Math.abs(t.asymmetryPercent) >= 15 ? "font-bold text-red-700" : ""
                                }
                              >
                                {t.asymmetryPercent.toFixed(1)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1 text-[10px] text-black/50">
                    Every value is left / right.
                  </p>
                </section>
              )
            })}

            {/* Plain-language notes, because this sheet leaves the building with
                somebody who has not been taught the vocabulary. */}
            <section className="avoid-break mt-7 border-t border-black/15 pt-3">
              <h2 className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-black/60 uppercase">
                <Timer className="h-3.5 w-3.5" />
                What these mean
              </h2>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-[11px] leading-relaxed text-black/75 sm:grid-cols-2">
                <Note term="Peak force">The hardest push or pull recorded, in kilograms.</Note>
                <Note term="Peak RFD">
                  How quickly force was produced. Strength can look unchanged while it takes longer to
                  arrive.
                </Note>
                <Note term="Time to peak">Seconds taken to reach that hardest effort.</Note>
                <Note term="Impulse">Force held over time, not just the single best moment.</Note>
                <Note term="Range of motion">How far the joint moved, in degrees.</Note>
                <Note term="Difference">
                  How far apart the two sides are. Above 15% is usually worth discussing.
                </Note>
              </dl>
            </section>
          </>
        )}

        <footer className="mt-8 border-t border-black/15 pt-3 text-center text-[10px] text-black/55">
          <p>Generated {stamp(report.generatedAt)}</p>
          {/* One line, never two. The clinic's own footer already reads "This
              is system generated", so printing a hard-coded copy underneath it
              said the same sentence twice. The default is only for a clinic
              that has cleared the field. */}
          {clinic.footerNote ? (
            <p className="mt-0.5">{clinic.footerNote}</p>
          ) : (
            <p className="mt-0.5">This is system generated.</p>
          )}
        </footer>
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/**
 * The headline: muscle age against real age, the way the patient will read
 * it — and what it was based on, and that it is a comparison, not a diagnosis.
 */
function MuscleAgeBox({ muscle }: { muscle: NonNullable<ValdReport["muscle"]> }) {
  const age = Math.round(muscle.muscleAge!)
  const diff = muscle.actualAge != null ? age - muscle.actualAge : null
  const tone = diff == null ? "text-black" : diff <= 0 ? "text-emerald-700" : diff <= 5 ? "text-amber-700" : "text-red-700"
  return (
    <section className="avoid-break mt-4 rounded-lg border border-black/15 p-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        {/* Muscle age and actual age side by side, at the same size — the
            colour is what says which way they differ. */}
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-black/55 uppercase">Muscle age</p>
          <p className={`text-2xl font-semibold tabular-nums ${tone}`}>
            {age}
            <span className="ml-1 text-sm font-medium text-black/60">yrs</span>
          </p>
        </div>
        {muscle.actualAge != null && (
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-black/55 uppercase">Actual age</p>
            <p className="text-2xl font-semibold tabular-nums">
              {muscle.actualAge}
              <span className="ml-1 text-sm font-medium text-black/60">yrs</span>
            </p>
          </div>
        )}
        {diff != null && (
          <p className={`pb-1 text-sm font-semibold ${tone}`}>
            {diff === 0 ? "Same as actual age" : diff > 0 ? `${diff} year${diff === 1 ? "" : "s"} older than actual age` : `${-diff} year${diff === -1 ? "" : "s"} younger than actual age`}
          </p>
        )}
        {muscle.gripPercentile != null && (
          <div className="ml-auto pb-1 text-right">
            <p className="text-[10px] font-semibold tracking-widest text-black/55 uppercase">Grip strength</p>
            <p className="text-sm">
              {ordinal(muscle.gripPercentile)} percentile for age
              {muscle.gripMuscleAge != null && <span className="text-black/60"> · grip age {Math.round(muscle.gripMuscleAge)}</span>}
            </p>
          </div>
        )}
      </div>
      {muscle.previous?.muscleAge != null && (
        <p className="mt-2 text-[11px] text-black/60">
          Previous visit ({whenDay(muscle.previous.day)}): muscle age {Math.round(muscle.previous.muscleAge)} yrs.
        </p>
      )}
    </section>
  )
}

function Stat({
  icon,
  label,
  value,
  warn,
}: {
  icon: React.ReactNode
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className="rounded-md border border-black/15 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-black/55 uppercase">
        <span className="text-black/45">{icon}</span>
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-semibold ${warn ? "text-red-700" : ""}`}>{value}</p>
    </div>
  )
}

function Note({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="inline font-semibold">{term}. </dt>
      <dd className="inline">{children}</dd>
    </div>
  )
}

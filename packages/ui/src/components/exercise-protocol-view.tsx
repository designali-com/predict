"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Dumbbell, ExternalLink, Printer, X } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { PredictMark } from "@workspace/ui/components/predict-loader"
import type {
  DietProtocolPrintClinic,
  DietProtocolPrintPatient,
} from "@workspace/ui/components/diet-protocol-print"

/**
 * The doctor's exercise prescription, read-only — on screen in the clinic, and
 * as a printable A4 sheet. The shape mirrors ExerciseProtocol in
 * @workspace/db/exercise-protocol (restated: the UI package does not depend on
 * the database package).
 */
export interface ExerciseProtocolData {
  title: string
  goal: string
  duration: string
  schedule: string
  warmup: string
  exercises: {
    name: string
    sets: string
    reps: string
    hold: string
    frequency: string
    notes: string
    videoUrl: string
    /** Set on a DynaMo test done at the clinic (see @workspace/db/vald-catalog). */
    vald?: string
  }[]
  precautions: string[]
  instructions: string[]
  followUp: string
  dailyCheckIn?: boolean
  updated?: { byName: string; at: string }
}

const PURPLE = "#8504FE"

function Facts({ protocol }: { protocol: ExerciseProtocolData }) {
  const facts = [
    ["Goal", protocol.goal],
    ["Duration", protocol.duration],
    ["When", protocol.schedule],
    ["Follow-up", protocol.followUp],
  ].filter(([, v]) => v)
  if (!facts.length) return null
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {facts.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</dt>
          <dd className="text-sm">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** On screen: what the patient was prescribed. */
export function ExerciseProtocolView({ protocol, className }: { protocol: ExerciseProtocolData; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <header className="rounded-xl border bg-muted/30 p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <Dumbbell className="h-3.5 w-3.5" /> Exercise prescription
        </p>
        <h2 className="mt-1 text-xl font-semibold">{protocol.title}</h2>
        <div className="mt-3">
          <Facts protocol={protocol} />
        </div>
      </header>

      {protocol.warmup && (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <b>Warm-up:</b> {protocol.warmup}
        </p>
      )}

      <section className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-xs">
                <th className="w-8 px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Exercise</th>
                <th className="px-3 py-2 font-semibold">Sets</th>
                <th className="px-3 py-2 font-semibold">Reps</th>
                <th className="px-3 py-2 font-semibold">Hold / time</th>
                <th className="px-3 py-2 font-semibold">How often</th>
              </tr>
            </thead>
            <tbody>
              {protocol.exercises.map((e, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">
                      {e.name}
                      {e.vald && (
                        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-primary">
                          VALD · at clinic
                        </span>
                      )}
                    </p>
                    {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                    {e.videoUrl && (
                      <a href={e.videoUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        Watch video <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2">{e.sets || "—"}</td>
                  <td className="px-3 py-2">{e.reps || "—"}</td>
                  <td className="px-3 py-2">{e.hold || "—"}</td>
                  <td className="px-3 py-2">{e.frequency || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {protocol.precautions.length > 0 && (
          <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
              <AlertTriangle className="h-3.5 w-3.5" /> Precautions
            </h3>
            <ul className="space-y-1 text-sm">
              {protocol.precautions.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          </section>
        )}
        {protocol.instructions.length > 0 && (
          <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Instructions
            </h3>
            <ul className="space-y-1 text-sm">
              {protocol.instructions.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

function gender(g: string | null | undefined) {
  return g ? g.charAt(0) + g.slice(1).toLowerCase() : null
}

/**
 * The printed exercise prescription — A4 portrait: letterhead, patient
 * details, the exercise table, precautions and instructions, signed by the
 * doctor. Long prescriptions run onto a second sheet; rows never split.
 */
export function ExerciseProtocolPrint({
  protocol,
  patient,
  clinic,
  savedAt,
  autoPrint = false,
}: {
  protocol: ExerciseProtocolData
  patient: DietProtocolPrintPatient
  clinic?: DietProtocolPrintClinic | null
  savedAt: string
  autoPrint?: boolean
}) {
  React.useEffect(() => {
    if (!autoPrint) return
    const t = setTimeout(() => window.print(), 500)
    return () => clearTimeout(t)
  }, [autoPrint])

  // The clinic's own colour and mark — the patient is the clinic's; Predict's when it has none.
  const accent = clinic?.brandColor || PURPLE
  const date = new Date(protocol.updated?.at ?? savedAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const details: [string, string | null | undefined][] = [
    ["Patient", patient.name],
    ["Patient ID", patient.code],
    ["Age / Sex", [patient.age != null ? `${patient.age} yrs` : null, gender(patient.gender)].filter(Boolean).join(" / ") || null],
    ["Phone", patient.phone],
    ["Date", date],
  ]
  const facts = [
    ["Goal", protocol.goal],
    ["Duration", protocol.duration],
    ["When", protocol.schedule],
    ["Follow-up", protocol.followUp],
  ].filter(([, v]) => v)

  return (
    <div className="min-h-screen overflow-x-auto bg-neutral-200/70 py-6 print:overflow-visible print:bg-white print:py-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          html, body { background: #fff !important; }
          .ex-no-print { display: none !important; }
          .ex-sheet { box-shadow: none !important; padding: 0 !important; width: auto !important; min-height: 0 !important; }
        }
        .ex-sheet, .ex-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      <div className="ex-no-print mx-auto mb-4 flex w-[210mm] items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">Exercise prescription · {patient.name}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.close()}>
            <X /> Close
          </Button>
          <Button onClick={() => window.print()}>
            <Printer /> Print / Save as PDF
          </Button>
        </div>
      </div>

      <article className="ex-sheet mx-auto flex min-h-[297mm] w-[210mm] flex-col gap-4 bg-white p-[12mm] text-[13px] leading-snug text-neutral-900 shadow-sm">
        <header className="flex items-start justify-between gap-4 border-b-[3px] pb-3" style={{ borderColor: accent }}>
          <div className="flex items-center gap-2.5">
            {clinic?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clinic.logoUrl} alt="" className="size-10 object-contain" />
            ) : (
              !clinic && <PredictMark className="size-10" />
            )}
            <p className="text-2xl font-bold leading-none tracking-wide">{clinic?.name ?? "Predict"}</p>
          </div>
          <div className="max-w-[80mm] text-right text-[11px] leading-relaxed text-neutral-600">
            {clinic?.address && <p>{clinic.address}</p>}
            {(clinic?.phone || clinic?.email) && (
              <p>{[clinic?.phone && `Ph ${clinic.phone}`, clinic?.email].filter(Boolean).join(" · ")}</p>
            )}
          </div>
        </header>

        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: accent }}>
            Exercise prescription
          </p>
          <h1 className="mt-1 text-xl font-bold">{protocol.title}</h1>
        </div>

        <dl className="grid grid-cols-5 overflow-hidden rounded-md border border-neutral-300">
          {details.map(([k, v]) => (
            <div key={k} className="border-r border-neutral-300 px-2.5 py-1.5 last:border-r-0">
              <dt className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">{k}</dt>
              <dd className="truncate text-[12px] font-medium">{v || "—"}</dd>
            </div>
          ))}
        </dl>

        {facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md px-3 py-2.5" style={{ background: `${accent}10` }}>
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="inline font-semibold">{k}: </dt>
                <dd className="inline">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {protocol.warmup && (
          <p>
            <b>Warm-up:</b> {protocol.warmup}
          </p>
        )}

        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-white" style={{ background: accent }}>
              <th className="w-7 border px-2 py-1.5" style={{ borderColor: accent }}>#</th>
              <th className="border px-2 py-1.5" style={{ borderColor: accent }}>Exercise</th>
              <th className="w-12 border px-2 py-1.5" style={{ borderColor: accent }}>Sets</th>
              <th className="w-20 border px-2 py-1.5" style={{ borderColor: accent }}>Reps</th>
              <th className="w-24 border px-2 py-1.5" style={{ borderColor: accent }}>Hold / time</th>
              <th className="w-24 border px-2 py-1.5" style={{ borderColor: accent }}>How often</th>
            </tr>
          </thead>
          <tbody>
            {protocol.exercises.map((e, i) => (
              <tr key={i} className="break-inside-avoid align-top odd:bg-neutral-50">
                <td className="border border-neutral-300 px-2 py-1.5 tabular-nums">{i + 1}</td>
                <td className="border border-neutral-300 px-2 py-1.5">
                  <p className="font-semibold">
                    {e.name}
                    {e.vald && <span className="ml-1.5 text-[10px] font-semibold uppercase" style={{ color: accent }}>· Tested at clinic</span>}
                  </p>
                  {e.notes && <p className="text-[11px] text-neutral-600">{e.notes}</p>}
                  {/* A real link: saved as a PDF from the browser, it stays clickable. */}
                  {e.videoUrl && (
                    <a href={e.videoUrl} target="_blank" rel="noreferrer" className="mt-0.5 block break-all text-[10px] font-semibold underline" style={{ color: accent }}>
                      ▶ Watch video — {e.videoUrl}
                    </a>
                  )}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5">{e.sets || "—"}</td>
                <td className="border border-neutral-300 px-2 py-1.5">{e.reps || "—"}</td>
                <td className="border border-neutral-300 px-2 py-1.5">{e.hold || "—"}</td>
                <td className="border border-neutral-300 px-2 py-1.5">{e.frequency || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-3 break-inside-avoid">
          {protocol.precautions.length > 0 && (
            <section className="rounded-lg border border-red-300 bg-red-50/60 p-3">
              <h2 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-red-700">Precautions</h2>
              <ul className="space-y-1">
                {protocol.precautions.map((p, i) => (
                  <li key={i}>
                    <span className="mr-1 font-bold text-red-600">✕</span>
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {protocol.instructions.length > 0 && (
            <section className="rounded-lg border border-emerald-300 bg-emerald-50/50 p-3">
              <h2 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-emerald-800">Instructions</h2>
              <ul className="space-y-1">
                {protocol.instructions.map((p, i) => (
                  <li key={i}>
                    <span className="mr-1 font-bold text-emerald-600">✓</span>
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {protocol.dailyCheckIn && (
          <p className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-[11px] text-neutral-600">
            Every morning you will get a WhatsApp message asking whether you did yesterday&apos;s exercises — tap a
            button to reply. Your doctor sees your answers.
          </p>
        )}

        <footer className="mt-auto border-t border-neutral-300 pt-3 text-[11px] text-neutral-600 break-inside-avoid">
          <p>
            Prescribed for <b className="text-neutral-900">{patient.name}</b> only. Stop and contact the clinic if pain
            increases or new symptoms appear.
          </p>
        </footer>
      </article>
    </div>
  )
}

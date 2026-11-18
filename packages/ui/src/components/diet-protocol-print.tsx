"use client"

import * as React from "react"
import { Printer, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import type { DietProtocolData } from "@workspace/ui/components/diet-protocol-view"
import { PredictMark } from "@workspace/ui/components/predict-loader"

export interface DietProtocolPrintPatient {
  name: string
  code?: string | null
  gender?: string | null
  age?: number | null
  phone?: string | null
}

export interface DietProtocolPrintClinic {
  name: string
  address?: string | null
  phone?: string | null
  email?: string | null
  /** The clinic's colour and round mark; without them a sheet is in Predict's. */
  brandColor?: string | null
  logoUrl?: string | null
}

const DIETS: Record<string, string> = { veg: "Vegetarian", egg: "Eggetarian", nonveg: "Non-vegetarian" }
const PURPLE = "#8504FE"

function date(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function gender(g: string | null | undefined) {
  if (!g) return null
  return g.charAt(0) + g.slice(1).toLowerCase()
}

/**
 * The printed diet plan — three A4 landscape pages, each its own sheet, so
 * nothing is squeezed to fit:
 *
 *   1. letterhead, patient details and the 7-day schedule, filling the page
 *   2. foods not allowed, vegetables and fruits
 *   3. portions, grocery list, where to buy, physician constraints, sign-off
 *
 * Used on its own page, outside any app shell, by the clinic and by the
 * patient's dashboard alike. On screen the sheets sit on a grey desk with
 * Print and Close above them; only the sheets reach the printer. `autoPrint`
 * opens the print dialog once drawn, for a Print button that opened a new tab.
 */
export function DietProtocolPrint({
  protocol,
  patient,
  clinic,
  savedAt,
  autoPrint = false,
}: {
  protocol: DietProtocolData
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

  const days = protocol.meals[0]?.days.length ?? 7
  const preparedBy = protocol.updated?.byName
  const details: [string, string | null | undefined][] = [
    ["Patient", patient.name],
    ["Patient ID", patient.code],
    ["Age / Sex", [patient.age != null ? `${patient.age} yrs` : null, gender(patient.gender)].filter(Boolean).join(" / ") || null],
    ["Phone", patient.phone],
    ["Diet type", protocol.diet ? DIETS[protocol.diet] : null],
    ["Date", date(protocol.updated?.at ?? savedAt)],
    ["Prepared by", preparedBy],
  ]

  return (
    <div className="min-h-screen overflow-x-auto bg-neutral-200/70 py-6 print:overflow-visible print:bg-white print:py-0">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          html, body { background: #fff !important; }
          .dp-no-print { display: none !important; }
          .dp-page { margin: 0 !important; box-shadow: none !important; break-after: page; }
          .dp-page:last-child { break-after: auto; }
        }
        .dp-page, .dp-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      <div className="dp-no-print mx-auto mb-4 flex w-[297mm] items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">Diet plan · {patient.name} · 3 pages</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.close()}>
            <X /> Close
          </Button>
          <Button onClick={() => window.print()}>
            <Printer /> Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------ page 1: who, and what to eat */}
      <Sheet>
        <header className="flex items-start justify-between gap-6 border-b-[3px] pb-2.5" style={{ borderColor: PURPLE }}>
          <Brand />
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: PURPLE }}>
              Patient dietary protocol
            </p>
            <h1 className="mt-0.5 text-xl font-bold">{protocol.title}</h1>
            {protocol.badge && <p className="mt-0.5 text-sm text-neutral-600">{protocol.badge}</p>}
          </div>
          <div className="max-w-[75mm] text-right text-xs leading-relaxed text-neutral-600">
            {clinic ? (
              <>
                <p className="text-sm font-semibold text-neutral-900">{clinic.name}</p>
                {clinic.address && <p>{clinic.address}</p>}
                {(clinic.phone || clinic.email) && (
                  <p>{[clinic.phone && `Ph ${clinic.phone}`, clinic.email].filter(Boolean).join(" · ")}</p>
                )}
              </>
            ) : (
              <p className="text-sm font-semibold text-neutral-900">Predict</p>
            )}
          </div>
        </header>

        <dl className="mt-2.5 grid grid-cols-7 overflow-hidden rounded-md border border-neutral-300">
          {details.map(([k, v]) => (
            <div key={k} className="border-r border-neutral-300 px-3 py-1.5 last:border-r-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{k}</dt>
              <dd className="truncate text-sm font-medium">{v || "—"}</dd>
            </div>
          ))}
        </dl>

        {(protocol.cookingOils || protocol.excludedSummary) && (
          <ul className="mt-3 flex flex-col gap-1 rounded-lg px-4 py-3 text-[14px]" style={{ background: `${PURPLE}10` }}>
            {protocol.cookingOils && (
              <li>
                <b>Cooking oils:</b> Strictly {protocol.cookingOils}
              </li>
            )}
            {protocol.excludedSummary && (
              <li>
                <b>Excluded:</b> {protocol.excludedSummary}
              </li>
            )}
          </ul>
        )}
        <div className="mt-3 grid flex-1 gap-4" style={{ gridTemplateColumns: `${colsFor(protocol.avoid)}fr ${colsFor(protocol.vegetables)}fr ${colsFor(protocol.fruits)}fr` }}>
          <ListBox title="Foods NOT allowed" subtitle="Strict elimination" tone="bad" items={protocol.avoid} />
          <ListBox title="Low GI vegetables" subtitle="Eat freely" tone="good" items={protocol.vegetables} />
          <ListBox title="Low GI fruits" subtitle="Portion controlled" tone="good" items={protocol.fruits} />
        </div>
        <PageFoot page={1} name={patient.name} />
      </Sheet>

      {/* ------------------------------------------------ page 2: the 7-day schedule, a page to itself */}
      <Sheet>
        <RunningHead title={protocol.title} />
        {/* The table takes every millimetre left on the page; rows share it. */}
        <div className="mt-3 flex flex-1 flex-col">
          <table className="w-full flex-1 table-fixed border-collapse text-[12.5px] leading-snug">
            <thead>
              <tr className="text-left text-white" style={{ background: PURPLE }}>
                <th className="w-[13%] border px-2 py-1.5 text-[13px] font-semibold" style={{ borderColor: PURPLE }}>
                  Meal
                </th>
                {Array.from({ length: days }, (_, i) => (
                  <th key={i} className="border px-2 py-1.5 text-[13px] font-semibold" style={{ borderColor: PURPLE }}>
                    Day {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {protocol.meals.map((meal, r) => (
                <tr key={r} className="align-middle odd:bg-neutral-50">
                  <th className="border border-neutral-300 px-2 py-1 text-left font-semibold">{meal.label}</th>
                  {meal.days.map((d, i) => (
                    <td key={i} className="border border-neutral-300 px-2 py-1 break-words">
                      {d || "—"}
                    </td>
                  ))}
                </tr>
              ))}
              {protocol.remarks.length > 0 && (
                <tr className="align-middle">
                  <th className="border border-neutral-300 px-2 py-1 text-left font-semibold">Remarks</th>
                  <td colSpan={days} className="border border-neutral-300 px-2 py-1 font-medium">
                    {protocol.remarks.join("   •   ")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PageFoot page={2} name={patient.name} />
      </Sheet>

      {/* ------------------------------------------------ page 3: how much, where from */}
      <Sheet>
        <RunningHead title={protocol.title} />
        <div className="mt-4 grid flex-1 grid-cols-3 gap-4">
          <Panel title="Portion measurements">
            {protocol.portions.length ? (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500">
                    <th className="pb-1.5 font-semibold">Measurement</th>
                    <th className="pb-1.5 text-right font-semibold">Approx value</th>
                  </tr>
                </thead>
                <tbody>
                  {protocol.portions.map((p, i) => (
                    <tr key={i} className="border-t border-neutral-200">
                      <td className="py-1.5">{p.measure}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{p.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty />
            )}
          </Panel>

          <ListBox title="Grocery list" items={protocol.grocery} />

          <div className="flex flex-col gap-4">
            <Panel title="Physician constraints">
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
                {protocol.physicianConstraints || "No specific restrictions mentioned by doctor."}
              </p>
            </Panel>
            {protocol.links.length > 0 && (
              <Panel title="Where to buy" grow>
                <ul className="space-y-2 text-[13px]">
                  {protocol.links.map((l, i) => (
                    <li key={i} className="min-w-0">
                      <b>{l.name}</b>
                      {l.store && <span className="text-neutral-500"> · {l.store}</span>}
                      <span className="block break-all text-[10px] text-neutral-500">{l.url}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>

        <footer className="mt-4 flex items-end justify-between gap-6 border-t border-neutral-300 pt-3 text-xs text-neutral-600">
          <p className="max-w-[60%] leading-relaxed">
            This plan is prepared for <b className="text-neutral-900">{patient.name}</b> only. Follow it as advised and
            consult your nutritionist before making changes. Stay hydrated &amp; stay active.
          </p>
          <div className="w-60 text-center">
            <div className="h-10" />
            <p className="border-t border-neutral-500 pt-1 text-sm font-semibold text-neutral-900">{preparedBy || "Nutritionist"}</p>
            <p>Clinical Nutritionist</p>
          </div>
        </footer>
        <PageFoot page={3} name={patient.name} />
      </Sheet>
    </div>
  )
}

/**
 * One A4 landscape page, the same size on screen and on paper. At least one
 * sheet tall, so boxes stretch to fill it; never capped, so content that does
 * not fit pushes on to the next sheet instead of running over the footer.
 * (A hair under 210mm: a page exactly the paper's height prints a blank one.)
 */
function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <section className="dp-page mx-auto mb-6 flex min-h-[209mm] w-[297mm] flex-col bg-white p-[10mm] text-neutral-900 shadow-sm">
      {children}
    </section>
  )
}

function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <PredictMark className={small ? "size-8" : "size-11"} />
      <div>
        <p className={`${small ? "text-lg" : "text-2xl"} font-bold leading-none tracking-wide`}>Predict</p>
      </div>
    </div>
  )
}

/** The slim header on pages 2 and 3; whose plan it is stays in the page foot. */
function RunningHead({ title }: { title: string }) {
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 border-b-[3px] pb-2.5" style={{ borderColor: PURPLE }}>
      <Brand small />
      <p className="text-lg font-bold">{title}</p>
      <span />
    </header>
  )
}

function PageFoot({ page, name }: { page: number; name: string }) {
  return (
    <p className="mt-2 flex shrink-0 justify-between text-[10px] text-neutral-400">
      <span>Predict · Diet plan for {name}</span>
      <span>Page {page} of 3</span>
    </p>
  )
}

function Panel({ title, children, grow = false }: { title: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <section className={`flex flex-col rounded-lg border border-neutral-300 p-4 ${grow ? "flex-1" : ""}`}>
      <h2 className="mb-2.5 text-[13px] font-bold uppercase tracking-wider text-neutral-700">{title}</h2>
      {children}
    </section>
  )
}

function Empty() {
  return <p className="text-sm text-neutral-500">—</p>
}

/** Rows a list box holds before it adds a column — sized so page 1's boxes fit A4. */
const ROWS_PER_COLUMN = 11

/** Columns a list needs: a long list spreads sideways rather than off the page. */
function colsFor(items: string[]) {
  return Math.min(4, Math.max(1, Math.ceil(items.length / ROWS_PER_COLUMN)))
}

function ListBox({
  title,
  subtitle,
  items,
  tone,
}: {
  title: string
  subtitle?: string
  items: string[]
  tone?: "good" | "bad"
}) {
  const columns = colsFor(items)
  const mark = tone === "bad" ? "✕" : tone === "good" ? "✓" : "•"
  const markColor = tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : "text-neutral-400"
  const frame =
    tone === "bad" ? "border-red-300 bg-red-50/60" : tone === "good" ? "border-emerald-300 bg-emerald-50/50" : "border-neutral-300"
  return (
    <section className={`flex flex-col rounded-lg border p-4 ${frame}`}>
      <h2 className={`text-[14px] font-bold uppercase tracking-wider ${tone === "bad" ? "text-red-700" : tone === "good" ? "text-emerald-800" : "text-neutral-700"}`}>
        {title}
      </h2>
      {subtitle && <p className="text-xs text-neutral-500">{subtitle}</p>}
      {items.length ? (
        <ul className="mt-2.5 gap-x-5 text-[13px] leading-snug" style={{ columnCount: columns }}>
          {items.map((item, i) => (
            <li key={i} className="break-inside-avoid py-[3px]">
              <span className={`mr-1.5 font-bold ${markColor}`}>{mark}</span>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <Empty />
      )}
    </section>
  )
}

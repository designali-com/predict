"use client"

import { Button } from "@workspace/ui/components/button"

import { useRef, useState } from "react"
import { AlertCircle, CheckCircle2, FileText, X } from "lucide-react"
import { uploadAndParseReport } from "@/src/lib/pdf/report-upload"
import type { ParsedReport } from "@/src/lib/pdf/parser"
import { PredictSpinner } from "@/src/components/predict-loader"

interface UploadReportModalProps {
  open: boolean
  reportType: "initial" | "final"
  /**
   * The patient's login, when they have one.
   *
   * Optional: a report belongs to the chart, and most walk-ins never sign up.
   * The account is what lets the patient read it in their own app.
   */
  patientId?: string
  /** The chart. Used when there is no account to file against. */
  chartId?: string
  /**
   * The visit it was collected for, when there is one.
   *
   * Optional because a report often arrives with no visit attached — the
   * patient walks in with a lab printout, or the desk files one from the
   * patient's own record. The server only honours it after checking the visit
   * belongs to this patient, so passing nothing simply files it against them.
   */
  appointmentId?: string
  /**
   * The blood test this sheet is the result of.
   *
   * Optional: a patient often walks in with a printout from a lab the clinic
   * never ordered. When it is known, it is what ties the PDF to the markers
   * that were paid for.
   */
  bloodTestOrderId?: string
  onClose: () => void
  onUploaded: () => void
  /** Optional callback to open manual biomarker entry with the parsed values */
  onEnterValues?: () => void
}

type Step = "pick" | "verify" | "done"

interface Row {
  shortCode: string
  label: string
  /** As typed — kept a string so a half-edited field does not become 0. */
  value: string
  unit: string | null
  source: string
  include: boolean
}

const panel =
  "relative w-full overflow-hidden rounded-md border border-black/22 bg-white text-black dark:border-white/15 dark:bg-black dark:text-white"
const primaryButton =
  "flex items-center justify-center gap-2 rounded-md bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-white/90"
const ghostButton =
  "rounded-md border border-black/20 px-4 py-3 text-sm font-medium transition hover:bg-black/5 disabled:opacity-60 dark:border-white/20 dark:hover:bg-white/5"

/**
 * File a lab sheet, and — if asked — read its biomarker values first.
 *
 * The reading is never saved on the strength of the parser alone. A PDF is
 * a picture of a table, and a number read out of the wrong row becomes a
 * biological age nobody can trace back. So what the parser found is shown
 * beside what it matched it on, every value is editable, and nothing is
 * written until somebody with the sheet in front of them confirms it.
 */
export function UploadReportModal({
  open,
  reportType,
  patientId,
  chartId,
  appointmentId,
  bloodTestOrderId,
  onClose,
  onUploaded,
  onEnterValues,
}: UploadReportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [autoParse, setAutoParse] = useState(true)
  const [step, setStep] = useState<Step>("pick")
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [notice, setNotice] = useState("")

  const [reportId, setReportId] = useState<string | undefined>()
  const [parsed, setParsed] = useState<ParsedReport | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [collectedOn, setCollectedOn] = useState("")

  const inputRef = useRef<HTMLInputElement>(null)

  // Biological age is only ever calculated from the Final report — an
  // Initial one is provisional. Reading values off it would produce a set of
  // readings that must not be used, so the option is shown and disabled
  // rather than quietly missing.
  const canReadValues = reportType === "final"

  if (!open) return null

  function reset() {
    setFile(null)
    setAutoParse(true)
    setStep("pick")
    setBusy(false)
    setErrorMsg("")
    setNotice("")
    setReportId(undefined)
    setParsed(null)
    setRows([])
    setCollectedOn("")
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleUpload() {
    if (!file) return
    setBusy(true)
    setErrorMsg("")

    try {
      const result = await uploadAndParseReport(file, {
        patientId,
        chartId,
        reportType,
        appointmentId,
        bloodTestOrderId,
        autoParse: autoParse && canReadValues,
      })

      setReportId(result.reportId)
      onUploaded()

      if (result.parsed?.markers.length) {
        setParsed(result.parsed)
        setCollectedOn(result.parsed.collectedOn ?? "")
        setRows(
          result.parsed.markers.map((m) => ({
            shortCode: m.shortCode,
            label: m.label,
            value: String(m.value),
            unit: m.unit,
            source:
              m.key === "egfr" && m.derivedFrom
                ? "calculated from creatinine, age and sex (CKD-EPI 2021) — not on the sheet"
                : m.derivedFrom
                  ? `calculated from ${m.derivedFrom.join(" ÷ ")}`
                  : `read as "${m.matchedAlias}"`,
            include: true,
          })),
        )
        setStep("verify")
      } else {
        setNotice(
          result.parseError ??
            (autoParse && canReadValues
              ? "The file is filed, but no biomarker values could be read from it."
              : ""),
        )
        setStep("done")
        setTimeout(handleClose, result.parseError ? 2500 : 900)
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm() {
    const readings = rows
      .filter((r) => r.include && r.value.trim() !== "" && Number.isFinite(Number(r.value)))
      .map((r) => ({ shortCode: r.shortCode, value: Number(r.value), unit: r.unit }))

    if (readings.length === 0) {
      setErrorMsg("Nothing selected to save.")
      return
    }

    setBusy(true)
    setErrorMsg("")

    try {
      const response = await fetch("/api/staff/biomarker-readings/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          patientId,
          chartId,
          bloodTestOrderId,
          collectedOn: /^\d{4}-\d{2}-\d{2}$/.test(collectedOn) ? collectedOn : null,
          readings,
        }),
      })

      // Same reason as the upload: a route that is missing or throwing does
      // not answer in JSON, and parsing it first hides what actually failed.
      const raw = await response.text()
      let data: {
        savedReadings?: unknown[]
        skipped?: { shortCode: string; reason: string }[]
        calculationError?: string
        error?: string
      } = {}
      try {
        data = raw ? JSON.parse(raw) : {}
      } catch {
        data = {}
      }

      if (!response.ok) {
        throw new Error(
          `${data.error || raw.slice(0, 120) || "Could not save these readings"} ` +
            `(${response.status} from /api/staff/biomarker-readings/confirm)`,
        )
      }

      const skipped: { shortCode: string; reason: string }[] = data.skipped ?? []
      setNotice(
        [
          `${data.savedReadings?.length ?? 0} reading${
            data.savedReadings?.length === 1 ? "" : "s"
          } saved.`,
          skipped.length ? `${skipped.length} skipped: ${skipped.map((s) => s.shortCode).join(", ")}.` : "",
          data.calculationError ? `Biological age not recalculated: ${data.calculationError}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      )
      onUploaded()
      setStep("done")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not save these readings")
    } finally {
      setBusy(false)
    }
  }

  const selected = rows.filter((r) => r.include).length

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
        <div
          className={`${panel} ${step === "verify" ? "max-w-3xl" : "max-w-md"}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-black/18 px-6 py-5 dark:border-white/10">
            <div>
              <h2 className="text-base font-semibold">
                {step === "verify"
                  ? "Check these values"
                  : `Upload ${reportType === "initial" ? "Initial" : "Final"} Report`}
              </h2>
              <p className="mt-0.5 text-xs text-black/65 dark:text-white/45">
                {step === "verify"
                  ? "Read from the PDF. Nothing is saved until you confirm it."
                  : reportType === "final"
                    ? "Biological age will be calculated from this report."
                    : "Saved for reference only."}
              </p>
            </div>
            <Button variant="ghost" size="icon-sm"
 onClick={handleClose}

 >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* ---------------- STEP 1: PICK A FILE ---------------- */}
          {step === "pick" && (
            <div className="flex flex-col gap-4 p-6">
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                hidden
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />

              <Button variant="outline" size="default" className="border-dashed w-full flex-col border-dashed text-black hover:bg-black/5 dark:text-white dark:hover:bg-white/5"
 type="button"
 onClick={() => inputRef.current?.click()}
 disabled={busy}

 >
                <FileText className="h-6 w-6 text-black/65 dark:text-white/40" />
                {file ? file.name : "Click to choose a file"}
                <span className="text-xs font-normal text-black/65 dark:text-white/40">
                  PDF, JPG or PNG
                </span>
              </Button>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-black/15 px-4 py-3 dark:border-white/10">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={autoParse && canReadValues}
                  disabled={!canReadValues || busy}
                  onChange={(e) => setAutoParse(e.target.checked)}
                />
                <span className="text-sm">
                  Read the biomarker values from this PDF
                  <span className="mt-0.5 block text-xs font-normal text-black/60 dark:text-white/45">
                    {canReadValues
                      ? "You check them on the next screen before anything is saved."
                      : "Only from a Final report — biological age is never calculated from an Initial one."}
                  </span>
                </span>
              </label>

              {errorMsg && (
                <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              <Button variant="ghost" size="default" type="button" onClick={handleUpload} disabled={!file || busy} className={primaryButton}>
                {busy ? (
                  <>
                    <PredictSpinner className="size-4" /> Uploading…
                  </>
                ) : (
                  "Submit"
                )}
              </Button>
            </div>
          )}

          {/* ---------------- STEP 2: VERIFY ---------------- */}
          {step === "verify" && parsed && (
            <div className="flex max-h-[70vh] flex-col">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/12 px-6 py-4 dark:border-white/8">
                <div className="text-xs text-black/65 dark:text-white/45">
                  {/* Whose sheet this is, so a report filed against the wrong
                      patient is caught here and not three screens later. */}
                  Sheet reads{" "}
                  <span className="font-medium text-black dark:text-white">
                    {parsed.patientName ?? "no name"}
                  </span>
                  {parsed.ageYears ? `, ${parsed.ageYears}` : ""}
                  {parsed.gender ? ` ${parsed.gender.toLowerCase()}` : ""}. Check this is the right
                  patient.
                </div>

                <label className="flex items-center gap-2 text-xs">
                  <span className="text-black/65 dark:text-white/45">Sample collected</span>
                  <input
                    type="date"
                    value={collectedOn}
                    onChange={(e) => setCollectedOn(e.target.value)}
                    className="rounded-md border border-black/20 bg-transparent px-2 py-1 text-sm dark:border-white/20"
                  />
                </label>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-black/50 dark:text-white/40">
                    <tr>
                      <th className="w-8 pb-2 font-medium" />
                      <th className="pb-2 font-medium">Biomarker</th>
                      <th className="pb-2 font-medium">Value</th>
                      <th className="pb-2 font-medium">Unit</th>
                      <th className="pb-2 font-medium">Where it came from</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={row.shortCode} className="border-t border-black/8 dark:border-white/8">
                        <td className="py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={row.include}
                            onChange={(e) =>
                              setRows((all) =>
                                all.map((r, i) =>
                                  i === index ? { ...r, include: e.target.checked } : r,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium">{row.shortCode}</div>
                          <div className="text-[11px] text-black/55 dark:text-white/40">{row.label}</div>
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.value}
                            onChange={(e) =>
                              setRows((all) =>
                                all.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)),
                              )
                            }
                            className="w-24 rounded-md border border-black/20 bg-transparent px-2 py-1 tabular-nums dark:border-white/20"
                          />
                        </td>
                        <td className="py-2 pr-3 text-black/65 dark:text-white/45">{row.unit ?? "—"}</td>
                        <td className="py-2 text-[11px] text-black/55 dark:text-white/40">{row.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {parsed.missing.length > 0 && (
                  <p className="mt-4 rounded-md border border-dashed border-black/15 px-4 py-3 text-[11px] leading-relaxed text-black/55 dark:border-white/10 dark:text-white/40">
                    Not on this sheet:{" "}
                    <span className="font-medium">
                      {parsed.missing.map((m) => m.shortCode).join(", ")}
                    </span>
                    . Those markers stay unmeasured — their domains are left out of the
                    calculation rather than counted as zero.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/12 px-6 py-4 dark:border-white/8">
                <div className="text-xs text-black/60 dark:text-white/45">
                  {errorMsg ? (
                    <span className="text-red-500">{errorMsg}</span>
                  ) : (
                    `${selected} of ${rows.length} will be saved. The PDF is already filed.`
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="default" type="button" onClick={handleClose} disabled={busy} className={ghostButton}>
                    Skip saving
                  </Button>
                  <Button variant="ghost" size="default"
                    type="button"
                    onClick={handleConfirm}
                    disabled={busy || selected === 0}
                    className={primaryButton}
                  >
                    {busy ? (
                      <>
                        <PredictSpinner className="size-4" /> Saving…
                      </>
                    ) : (
                      `Confirm ${selected} reading${selected === 1 ? "" : "s"}`
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- STEP 3: DONE ---------------- */}
          {step === "done" && (
            <div className="flex flex-col gap-4 p-6">
              <div className="flex items-start gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{notice || "Report uploaded."}</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                {onEnterValues && (
                  <Button variant="outline" size="lg" className="hover:bg-black/5 dark:hover:bg-white/5 flex-1"
 type="button"
 onClick={() => {
 handleClose()
 onEnterValues()
 }}

 >
                    Enter missing values
                  </Button>
                )}
                <Button variant="ghost" size="default" type="button" onClick={handleClose} className={`h-auto justify-start whitespace-normal text-left ${primaryButton} flex-1`}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

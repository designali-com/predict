"use client"

import { useEffect, useRef, useState } from "react"
import { Maximize2, Printer } from "lucide-react"
import type { PatientSummary } from "@workspace/db/patient-summary"
import { PredictSpinner } from "@/src/components/predict-loader"
import { PatientSummaryView } from "./patient-summary-view"


/**
 * The Summary tab: the assessment loaded and shown. "Present" opens it full
 * screen to turn towards the patient; "Print" prints only the summary, in the
 * theme it is shown in — from the record it opens the summary's own page (no
 * sidebar or tabs) and prints there.
 */
export function PatientSummaryPanel({
  contactId,
  presenting = false,
  autoPrint = false,
}: {
  contactId: string
  /** On the summary's own page (/summary/[id]). */
  presenting?: boolean
  /** Print as soon as it has loaded — /summary/[id]?print=1. */
  autoPrint?: boolean
}) {
  const [summary, setSummary] = useState<PatientSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const printed = useRef(false)

  useEffect(() => {
    let live = true
    fetch(`/api/staff/patients/${contactId}/summary`)
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!live) return
        if (res.ok) setSummary(data)
        else setError(data?.error ?? "Could not load the summary")
      })
      .catch(() => live && setError("Could not load the summary"))
    return () => {
      live = false
    }
  }, [contactId])

  useEffect(() => {
    if (summary && autoPrint && !printed.current) {
      printed.current = true
      window.print()
    }
  }, [summary, autoPrint])

  if (error) return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{error}</p>
  if (!summary) {
    return (
      <div className="flex justify-center py-16">
        <PredictSpinner className="size-6" />
      </div>
    )
  }

  const button =
    "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted"
  return (
    <PatientSummaryView
      summary={summary}
      actions={
        <div className="flex gap-2 print:hidden">
          {!presenting && (
            <button type="button" className={button} onClick={() => window.open(`/summary/${contactId}`, "_blank")}>
              <Maximize2 className="h-3.5 w-3.5" /> Present
            </button>
          )}
          <button
            type="button"
            className={button}
            onClick={() => (presenting ? window.print() : window.open(`/summary/${contactId}?print=1`, "_blank"))}
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
        </div>
      }
    />
  )
}

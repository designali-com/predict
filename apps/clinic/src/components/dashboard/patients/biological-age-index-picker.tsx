"use client"

import { useCallback, useEffect, useState } from "react"

import { PredictSpinner } from "@/src/components/predict-loader"

interface IndexOption {
  id: string
  shortCode: string
  name: string
  domainCount: number
}

interface IndexState {
  current: (IndexOption & { isDefault: boolean }) | null
  defaultShortCode: string
  options: IndexOption[]
  latest: { biologicalAge: number; chronologicalAge: number; deltaAge: number; calculatedAt: string } | null
  recalculated?: boolean
  recalculationNote?: string | null
}

/** "Composite Biological LegAge  Index (CBLAI):" → "Composite Biological LegAge Index". */
function cleanName(name: string, shortCode: string) {
  return name
    .replace(new RegExp(`\\s*\\(\\s*${shortCode}\\s*\\)\\s*:?\\s*$`, "i"), "")
    .replace(/[:\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Which index this patient's biological age is built from.
 *
 * One per patient, CBLAI unless somebody here chooses otherwise. The
 * patient's own clock follows whatever is picked, and picking recalculates
 * at once from the readings already on file — so the clinician sees the new
 * number here, and the patient sees it the next time they open the app.
 */
export function BiologicalAgeIndexPicker({
  patientId,
  refreshKey,
  onChanged,
}: {
  patientId: string
  /** Bumped when new readings are saved elsewhere on the page, so the age shown here is not stale. */
  refreshKey?: number
  /** After a change, so the blood work below reloads with the new result. */
  onChanged?: () => void
}) {
  const [state, setState] = useState<IndexState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [note, setNote] = useState("")

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/patients/${patientId}/index`)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error ?? "Could not load the index.")
      return
    }
    setState(data)
  }, [patientId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  async function choose(value: string) {
    if (!state) return
    setSaving(true)
    setError("")
    setNote("")

    try {
      const res = await fetch(`/api/staff/patients/${patientId}/index`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indexId: value }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? "Could not change the index.")

      setState(data)
      setNote(
        data.recalculationNote ??
          (data.recalculated && data.latest
            ? `Recalculated — biological age ${data.latest.biologicalAge.toFixed(1)}.`
            : "Saved."),
      )
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the index.")
    } finally {
      setSaving(false)
    }
  }

  if (!state && !error) {
    return (
      <div className="flex items-center gap-2 text-xs text-black/55 dark:text-white/40">
        <PredictSpinner className="size-4" /> Loading index…
      </div>
    )
  }

  const current = state?.current

  return (
    <div className="flex flex-col gap-2 rounded-md border border-black/15 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="bio-index" className="text-xs font-medium text-black/70 dark:text-white/55">
          Biological age index
        </label>

        <select
          id="bio-index"
          value={current?.id ?? ""}
          disabled={saving || !state?.options.length}
          onChange={(e) => choose(e.target.value)}
          className="rounded-md border border-black/18 bg-white px-2.5 py-1.5 text-sm focus:border-black/40 focus:outline-none disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-white"
        >
          {state?.options.map((option) => (
            <option key={option.id} value={option.id} disabled={option.domainCount === 0}>
              {option.shortCode}
              {option.shortCode === state.defaultShortCode ? " (default)" : ""} — {option.domainCount} domain
              {option.domainCount === 1 ? "" : "s"}
            </option>
          ))}
        </select>

        {saving && <PredictSpinner className="size-4" />}

        {state?.latest && !saving && (
          <span className="text-xs text-black/60 dark:text-white/45">
            Biological age{" "}
            <span className="font-semibold text-black dark:text-white">
              {state.latest.biologicalAge.toFixed(1)}
            </span>{" "}
            against {Math.round(state.latest.chronologicalAge)}
          </span>
        )}
      </div>

      {current && (
        <p className="text-[11px] leading-relaxed text-black/55 dark:text-white/40">
          {cleanName(current.name, current.shortCode)}
          {current.isDefault ? " — the default, until someone chooses otherwise" : ""}. The patient&apos;s
          own clock, its domains and their biological age are all built from this index.
        </p>
      )}

      {note && <p className="text-xs text-emerald-600 dark:text-emerald-400">{note}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

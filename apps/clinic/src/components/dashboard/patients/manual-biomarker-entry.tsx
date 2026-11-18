"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, FileText, Filter, Sparkles, X } from "lucide-react"
import { formatPrice } from "@workspace/db/treatment-plan"

interface Marker {
  id: string
  name: string
  shortCode: string
  unit: string | null
  rangeMin: number | null
  rangeMax: number | null
  direction: boolean
  priceInPaise: number
  lastValue: number | null
  lastOn: string | null
}

interface BloodTestOrder {
  id: string
  orderedOn: string
  collectedOn: string | null
  status: string
  biomarkerIds: string[]
  resultsIn: number
  itemCount: number
  values?: Record<string, number>
  reportId?: string | null
}

interface RecentUpload {
  reportId: string
  fileName: string | null
  reportType: string | null
  uploadedAt: string
  collectedOn: string | null
  bloodTestOrderId: string | null
  values: Record<string, number>
  markerCount: number
}

interface LatestPanel {
  collectedOn: string
  reportId: string | null
  bloodTestOrderId: string | null
  values: Record<string, number>
  markerCount: number
}

interface Scored {
  indexShortCode: string
  biologicalAge: number
  deltaAge: number
}

const INPUT =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-1.5 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

function today(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  })
}

function rangeOf(m: Marker): string {
  if (m.rangeMin == null && m.rangeMax == null) return "—"
  if (m.rangeMin == null) return `up to ${m.rangeMax}`
  if (m.rangeMax == null) return `from ${m.rangeMin}`
  return `${m.rangeMin} – ${m.rangeMax}`
}

/**
 * Lab values typed in off the printout, with automatic prefilling from
 * recently uploaded/parsed blood reports.
 *
 * When a blood report PDF is uploaded, whatever biomarkers could be parsed are
 * automatically fetched into this form. The missing biomarkers remain blank so
 * staff can manually complete the panel without having to retype the numbers
 * that were already read from the sheet.
 */
export function ManualBiomarkerEntry({
  patientId,
  patientName,
  initialOrderId,
  onClose,
  onSaved,
}: {
  /** The chart. Deliberately not the account — most patients have no login. */
  patientId: string
  patientName: string
  initialOrderId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [markers, setMarkers] = useState<Marker[]>([])
  const [orders, setOrders] = useState<BloodTestOrder[]>([])
  const [orderId, setOrderId] = useState(initialOrderId ?? "")
  const [reportId, setReportId] = useState("")
  const [values, setValues] = useState<Record<string, string>>({})
  const [collectedOn, setCollectedOn] = useState(today())
  const [query, setQuery] = useState("")
  const [filterMode, setFilterMode] = useState<"all" | "missing" | "autofilled">("all")
  const [autofilledMarkers, setAutofilledMarkers] = useState<Set<string>>(new Set())
  const [autofillBanner, setAutofillBanner] = useState<{
    title: string
    count: number
    date: string | null
  } | null>(null)
  const [recentUploadData, setRecentUploadData] = useState<RecentUpload | null>(null)

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{
    saved: number
    scored: Scored[]
    scoreError: string | null
  } | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/staff/biomarker-readings/manual?patientId=${encodeURIComponent(patientId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!live) return
        const biomarkerList: Marker[] = data?.biomarkers ?? []
        setMarkers(biomarkerList)
        const list: BloodTestOrder[] = data?.orders ?? []
        setOrders(list)
        const recent: RecentUpload | null = data?.recentUpload ?? null
        setRecentUploadData(recent)

        // Case 1: Specific order requested or waiting on results
        const targetOrder = initialOrderId
          ? list.find((o) => o.id === initialOrderId)
          : list.find((o) => o.resultsIn > 0 && o.resultsIn < o.itemCount)

        if (targetOrder) {
          setOrderId(targetOrder.id)
          if (targetOrder.collectedOn) setCollectedOn(targetOrder.collectedOn)
          if (targetOrder.reportId) setReportId(targetOrder.reportId)

          if (targetOrder.values && Object.keys(targetOrder.values).length > 0) {
            const stringValues: Record<string, string> = {}
            const autofilled = new Set<string>()
            for (const [k, v] of Object.entries(targetOrder.values)) {
              if (v != null && Number.isFinite(v)) {
                stringValues[k] = String(v)
                autofilled.add(k)
              }
            }
            setValues(stringValues)
            setAutofilledMarkers(autofilled)
            setAutofillBanner({
              title: `Order from ${shortDate(targetOrder.collectedOn ?? targetOrder.orderedOn)}`,
              count: autofilled.size,
              date: targetOrder.collectedOn,
            })
            return
          }
        }

        // Case 2: Priority: Recent blood report uploaded & parsed
        if (recent && Object.keys(recent.values || {}).length > 0) {
          setReportId(recent.reportId || "")
          if (recent.bloodTestOrderId) {
            setOrderId(recent.bloodTestOrderId)
          }
          if (recent.collectedOn) {
            setCollectedOn(recent.collectedOn)
          }
          const stringValues: Record<string, string> = {}
          const autofilled = new Set<string>()
          for (const [k, v] of Object.entries(recent.values)) {
            if (v != null && Number.isFinite(v)) {
              stringValues[k] = String(v)
              autofilled.add(k)
            }
          }
          setValues(stringValues)
          setAutofilledMarkers(autofilled)
          setAutofillBanner({
            title: recent.fileName || "Uploaded blood report",
            count: autofilled.size,
            date: recent.collectedOn,
          })
          return
        }

        // Case 3: Order waiting with no values yet
        const waitingOrder = list.find((o) => o.resultsIn < o.itemCount)
        if (waitingOrder) {
          setOrderId(waitingOrder.id)
          if (waitingOrder.collectedOn) setCollectedOn(waitingOrder.collectedOn)
          return
        }

        // Case 4: Values saved without a report or an order (typed in, or
        // entered before the PDF was filed) — show the last panel rather than
        // an empty form, so completing it does not mean retyping it.
        const panel: LatestPanel | null = data?.latestPanel ?? null
        if (panel && Object.keys(panel.values || {}).length > 0) {
          if (panel.collectedOn) setCollectedOn(panel.collectedOn)
          if (panel.reportId) setReportId(panel.reportId)
          if (panel.bloodTestOrderId) setOrderId(panel.bloodTestOrderId)
          const stringValues: Record<string, string> = {}
          const autofilled = new Set<string>()
          for (const [k, v] of Object.entries(panel.values)) {
            if (v != null && Number.isFinite(v)) {
              stringValues[k] = String(v)
              autofilled.add(k)
            }
          }
          setValues(stringValues)
          setAutofilledMarkers(autofilled)
          setAutofillBanner({
            title: `Last saved panel (${shortDate(panel.collectedOn)})`,
            count: autofilled.size,
            date: panel.collectedOn,
          })
        }
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [patientId, initialOrderId])

  // Only what was actually typed or prefilled
  const filled = useMemo(
    () => markers.filter((m) => (values[m.id] ?? "").trim() !== ""),
    [markers, values],
  )

  const autofillCount = useMemo(
    () => markers.filter((m) => autofilledMarkers.has(m.id) && (values[m.id] ?? "").trim() !== "").length,
    [markers, autofilledMarkers, values],
  )

  const missingCount = useMemo(
    () => markers.filter((m) => !(values[m.id] ?? "").trim()).length,
    [markers, values],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = markers
    if (q) {
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.shortCode.toLowerCase().includes(q),
      )
    }
    if (filterMode === "missing") {
      list = list.filter((m) => !(values[m.id] ?? "").trim())
    } else if (filterMode === "autofilled") {
      list = list.filter(
        (m) => autofilledMarkers.has(m.id) && (values[m.id] ?? "").trim() !== "",
      )
    }
    return list
  }, [markers, query, filterMode, values, autofilledMarkers])

  const cost = filled.reduce((sum, m) => sum + m.priceInPaise, 0)
  const unpriced = filled.filter((m) => m.priceInPaise === 0).length

  async function save() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch("/api/staff/biomarker-readings/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          collectedOn,
          bloodTestOrderId: orderId || null,
          reportId: reportId || null,
          values: filled.map((m) => ({ biomarkerId: m.id, value: Number(values[m.id]) })),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not save those values")
        return
      }
      setDone({
        saved: Number(data?.saved ?? 0),
        scored: data?.biologicalAge ?? [],
        scoreError: data?.scoreError ?? null,
      })
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  function handleOrderChange(selectedOrderId: string) {
    setOrderId(selectedOrderId)
    const picked = orders.find((o) => o.id === selectedOrderId)
    if (picked) {
      if (picked.collectedOn) setCollectedOn(picked.collectedOn)
      if (picked.reportId) setReportId(picked.reportId)
      if (picked.values && Object.keys(picked.values).length > 0) {
        const stringValues: Record<string, string> = {}
        const autofilled = new Set<string>()
        for (const [k, v] of Object.entries(picked.values)) {
          if (v != null && Number.isFinite(v)) {
            stringValues[k] = String(v)
            autofilled.add(k)
          }
        }
        setValues(stringValues)
        setAutofilledMarkers(autofilled)
        setAutofillBanner({
          title: `Order from ${shortDate(picked.collectedOn ?? picked.orderedOn)}`,
          count: autofilled.size,
          date: picked.collectedOn,
        })
        return
      }
    }

    // If switched away and recentUploadData exists, offer fallback
    if (!selectedOrderId && recentUploadData && Object.keys(recentUploadData.values || {}).length > 0) {
      const stringValues: Record<string, string> = {}
      const autofilled = new Set<string>()
      for (const [k, v] of Object.entries(recentUploadData.values)) {
        if (v != null && Number.isFinite(v)) {
          stringValues[k] = String(v)
          autofilled.add(k)
        }
      }
      setValues(stringValues)
      setAutofilledMarkers(autofilled)
      setReportId(recentUploadData.reportId || "")
      if (recentUploadData.collectedOn) setCollectedOn(recentUploadData.collectedOn)
      setAutofillBanner({
        title: recentUploadData.fileName || "Uploaded blood report",
        count: autofilled.size,
        date: recentUploadData.collectedOn,
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-md border border-black/18 bg-white shadow-lg dark:border-white/10 dark:bg-black">
        <div className="flex items-start justify-between gap-3 border-b border-black/12 px-4 py-3 dark:border-white/8">
          <div>
            <h2 className="text-sm font-semibold">Enter blood test values</h2>
            <p className="mt-0.5 text-xs text-black/60 dark:text-white/40">{patientName}</p>
          </div>
          <Button variant="ghost" size="default" className="hover:bg-black/5 dark:hover:bg-white/5"
 onClick={onClose}

 aria-label="Close"
 >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {done ? (
          <div className="space-y-3 p-4">
            <p className="text-sm font-medium">
              {done.saved} value{done.saved === 1 ? "" : "s"} saved & biological age recalculated.
            </p>
            {done.scored.length > 0 ? (
              <div className="space-y-1.5">
                {done.scored.map((s) => (
                  <div
                    key={s.indexShortCode}
                    className="flex items-center justify-between rounded-md border border-black/12 px-3 py-2 text-sm dark:border-white/8"
                  >
                    <span className="font-medium uppercase">{s.indexShortCode}</span>
                    <span>
                      {s.biologicalAge.toFixed(1)} yrs{" "}
                      <span
                        className={
                          s.deltaAge > 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }
                      >
                        ({s.deltaAge > 0 ? "+" : ""}
                        {s.deltaAge.toFixed(1)})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-black/60 dark:text-white/40">
                {done.scoreError ??
                  "Biological age needs markers from a scored domain, and a date of birth on the chart."}
              </p>
            )}
            <Button variant="default" size="sm"
 onClick={onClose}

 >
              Done
            </Button>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-14">
            <PredictSpinner />
          </div>
        ) : (
          <>
            {/* Auto-filled notification banner */}
            {autofillBanner && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    <strong>{autofillBanner.count} values auto-filled</strong> from {autofillBanner.title}
                    {autofillBanner.date ? ` (drawn on ${shortDate(autofillBanner.date)})` : ""}.
                    Missing values can be manually entered below.
                  </span>
                </div>
                <Button variant="link" size="default" className="text-[11px] underline opacity-75 hover:opacity-100"
 type="button"
 onClick={() => {
 setValues({})
 setAutofilledMarkers(new Set())
 setAutofillBanner(null)
 }}

 >
                  Clear auto-fill
                </Button>
              </div>
            )}

            {!autofillBanner && recentUploadData && Object.keys(recentUploadData.values || {}).length > 0 && (
              <div className="flex items-center justify-between gap-2 border-b border-black/10 bg-black/[0.02] px-4 py-2 text-xs text-black/70 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/70">
                <span>
                  Values available from <strong>{recentUploadData.fileName || "Uploaded report"}</strong> ({recentUploadData.markerCount} markers)
                </span>
                <Button variant="ghost" size="default" className="bg-black/10 text-[11px] hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/15"
 type="button"
 onClick={() => {
 const stringValues: Record<string, string> = {}
 const autofilled = new Set<string>()
 for (const [k, v] of Object.entries(recentUploadData.values)) {
 if (v != null && Number.isFinite(v)) {
 stringValues[k] = String(v)
 autofilled.add(k)
 }
 }
 setValues(stringValues)
 setAutofilledMarkers(autofilled)
 setReportId(recentUploadData.reportId || "")
 if (recentUploadData.collectedOn) setCollectedOn(recentUploadData.collectedOn)
 setAutofillBanner({
 title: recentUploadData.fileName || "Uploaded blood report",
 count: autofilled.size,
 date: recentUploadData.collectedOn,
 })
 }}

 >
                  Auto-fill from report
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3 border-b border-black/12 px-4 py-3 dark:border-white/8">
              <div>
                <label className="mb-1 block text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
                  Blood drawn on
                </label>
                <input
                  type="date"
                  value={collectedOn}
                  max={today()}
                  onChange={(e) => setCollectedOn(e.target.value)}
                  className="rounded-md border border-black/18 bg-white px-2.5 py-1.5 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"
                />
              </div>

              {orders.length > 0 && (
                <div className="min-w-[190px]">
                  <label className="mb-1 block text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
                    From which blood test
                  </label>
                  <select
                    value={orderId}
                    onChange={(e) => handleOrderChange(e.target.value)}
                    className={INPUT}
                  >
                    <option value="">Not from a test ordered here</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {shortDate(o.collectedOn ?? o.orderedOn)} · {o.itemCount} test
                        {o.itemCount === 1 ? "" : "s"}
                        {o.resultsIn > 0 ? ` · ${o.resultsIn} in` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="min-w-[160px] flex-1">
                <label className="mb-1 block text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/40">
                  Find a marker
                </label>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or code (e.g. Glucose, hs-CRP)..."
                  className="w-full rounded-md border border-black/18 bg-white px-2.5 py-1.5 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"
                />
              </div>
            </div>

            {/* Quick Filter tabs */}
            <div className="flex items-center gap-1.5 border-b border-black/12 px-4 py-2 text-xs dark:border-white/8">
              <span className="mr-1 text-[11px] font-semibold tracking-wider text-black/50 uppercase dark:text-white/35">
                Show:
              </span>
              <Button variant="ghost" size="default"
                type="button"
                onClick={() => setFilterMode("all")}
                className={`px-2 py-1 font-medium transition ${
 filterMode ==="all"
 ?"bg-black text-white dark:bg-white dark:text-black"
 :"text-black/60 hover:bg-black/5 dark:text-white/40 dark:hover:bg-white/5"
 }`}
              >
                All ({markers.length})
              </Button>
              <Button variant="ghost" size="default"
                type="button"
                onClick={() => setFilterMode("missing")}
                className={`px-2 py-1 font-medium transition ${
 filterMode ==="missing"
 ?"bg-amber-600 text-white dark:bg-amber-500 dark:text-black"
 :"text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/10"
 }`}
              >
                Missing to enter ({missingCount})
              </Button>
              {autofillCount > 0 && (
                <Button variant="ghost" size="default"
                  type="button"
                  onClick={() => setFilterMode("autofilled")}
                  className={`px-2 py-1 font-medium transition ${
 filterMode ==="autofilled"
 ?"bg-emerald-600 text-white dark:bg-emerald-500 dark:text-black"
 :"text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
 }`}
                >
                  Auto-filled ({autofillCount})
                </Button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4">
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 bg-white dark:bg-black">
                  <tr className="text-left text-[11px] tracking-widest text-black/50 uppercase dark:text-white/35">
                    <th className="w-auto py-2 font-semibold">Biomarker</th>
                    <th className="w-[92px] py-2 text-right font-semibold">Normal</th>
                    <th className="w-[104px] py-2 text-right font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/8 dark:divide-white/5">
                  {shown.map((m) => {
                    const val = values[m.id] ?? ""
                    const isAutofilled = autofilledMarkers.has(m.id) && val.trim() !== ""
                    const isMissing = !val.trim()

                    return (
                      <tr key={m.id} className={isAutofilled ? "bg-emerald-500/[0.02]" : ""}>
                        <td className="py-2 pr-3 align-middle">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium" title={m.name}>
                              {m.name}
                            </span>
                            {isAutofilled && (
                              <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                                From report
                              </span>
                            )}
                            {isMissing && (
                              <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                Missing
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-black/45 dark:text-white/30">
                            {m.shortCode}
                            {m.unit ? ` · ${m.unit}` : ""}
                            {m.lastValue != null
                              ? ` · last ${m.lastValue}${m.lastOn ? ` on ${shortDate(m.lastOn)}` : ""}`
                              : ""}
                          </div>
                        </td>
                        <td className="py-2 text-right align-middle text-xs whitespace-nowrap text-black/50 dark:text-white/35">
                          {rangeOf(m)}
                        </td>
                        <td className="py-2 pl-2 align-middle">
                          <input
                            type="number"
                            step="any"
                            inputMode="decimal"
                            value={values[m.id] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value
                              setValues((prev) => ({ ...prev, [m.id]: v }))
                              if (!v) {
                                setAutofilledMarkers((prev) => {
                                  const next = new Set(prev)
                                  next.delete(m.id)
                                  return next
                                })
                              }
                            }}
                            className={`w-full rounded-md border px-2 py-1.5 text-right text-sm focus:outline-none ${
                              isAutofilled
                                ? "border-emerald-500/40 bg-emerald-500/5 font-medium text-emerald-950 focus:border-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-100"
                                : isMissing
                                  ? "border-black/18 bg-white focus:border-black/40 dark:border-white/10 dark:bg-black dark:text-white"
                                  : "border-black/25 bg-white font-medium focus:border-black/40 dark:border-white/20 dark:bg-black dark:text-white"
                            }`}
                            placeholder="—"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {shown.length === 0 && (
                <p className="py-6 text-center text-sm text-black/50 dark:text-white/35">
                  No marker matches that filter.
                </p>
              )}
            </div>

            <div className="border-t border-black/12 px-4 py-3 dark:border-white/8">
              {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-black/60 dark:text-white/40">
                  <span className="font-semibold text-black dark:text-white">
                    {filled.length} of {markers.length}
                  </span>{" "}
                  values filled
                  {autofillCount > 0 && <> ({autofillCount} from report)</>}
                  {cost > 0 && <> · {formatPrice(cost)}</>}
                  {unpriced > 0 && filled.length > 0 && <> · {unpriced} not priced yet</>}
                </div>
                <Button variant="default" size="sm"
 onClick={save}
 disabled={busy || filled.length === 0}

 >
                  {busy ? "Saving…" : "Save and calculate"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

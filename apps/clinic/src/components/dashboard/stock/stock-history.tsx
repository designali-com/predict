"use client"

import { Button } from "@workspace/ui/components/button"

import { useCallback, useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Download, Search } from "lucide-react"
import { MOVEMENT_KINDS } from "@workspace/db/stock-service"
import { INPUT, LABEL, qty, rupees } from "./stock-styles"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Row {
  id: string
  medicineId: string
  medicineName: string
  unit: string
  kind: string
  quantity: number
  batchNo: string | null
  unitCostInPaise: number | null
  note: string | null
  contactId: string | null
  contactName: string | null
  sittingId: string | null
  actorName: string | null
  occurredAt: string
}

const PAGE = 100

const KIND_LABEL = new Map<string, string>(MOVEMENT_KINDS.map((k) => [k.value, k.label]))

/**
 * The full ledger.
 *
 * Every balance on this page is the sum of these rows, so this is not a
 * secondary view of the stock — it is the stock, and everything else is a
 * summary of it. Which is why nothing here is capped to a recent window by
 * default: "where did forty sachets go" gets asked months later.
 */
export function StockHistory({ medicines }: { medicines: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [filters, setFilters] = useState({ medicine: "", kind: "", from: "", to: "", q: "" })
  // Applied separately from the typing, so a half-typed patient name does not
  // fire a query per keystroke against the whole ledger.
  const [applied, setApplied] = useState(filters)

  const query = useCallback((f: typeof filters, at: number, limit: number) => {
    const params = new URLSearchParams({ view: "history", limit: String(limit), offset: String(at) })
    if (f.medicine) params.set("medicine", f.medicine)
    if (f.kind) params.set("kind", f.kind)
    if (f.from) params.set("from", f.from)
    if (f.to) params.set("to", f.to)
    if (f.q.trim()) params.set("q", f.q.trim())
    return `/api/staff/stock?${params.toString()}`
  }, [])

  useEffect(() => {
    let live = true
    setLoading(true)
    fetch(query(applied, offset, PAGE))
      .then((r) => r.json())
      .then((data) => {
        if (!live) return
        setRows(data?.rows ?? [])
        setTotal(data?.total ?? 0)
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [applied, offset, query])

  const apply = (next: typeof filters) => {
    setApplied(next)
    setOffset(0)
  }

  /** The filtered ledger as a file, because a storeroom count happens on paper. */
  const download = async () => {
    setExporting(true)
    try {
      const res = await fetch(query(applied, 0, 500))
      const data = await res.json()
      const head = ["Date", "Medicine", "Unit", "Movement", "In", "Out", "Name", "Batch", "Unit cost", "Note", "Recorded by"]
      const body = (data?.rows ?? []).map((r: Row) =>
        [
          new Date(r.occurredAt).toLocaleString("en-IN"),
          r.medicineName,
          r.unit,
          KIND_LABEL.get(r.kind) ?? r.kind,
          r.quantity > 0 ? r.quantity : "",
          r.quantity < 0 ? -r.quantity : "",
          r.contactName ?? "",
          r.batchNo ?? "",
          r.unitCostInPaise === null ? "" : (r.unitCostInPaise / 100).toFixed(2),
          r.note ?? "",
          r.actorName ?? "",
        ]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(","),
      )
      const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `stock-history-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const page = Math.floor(offset / PAGE) + 1
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-black/18 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="lg:col-span-2">
            <span className={LABEL}>Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/45 dark:text-white/35" />
              <input
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && apply(filters)}
                placeholder="Medicine, patient, batch or note"
                className={`${INPUT} pl-8`}
              />
            </div>
          </label>
          <label>
            <span className={LABEL}>Medicine</span>
            <select
              value={filters.medicine}
              onChange={(e) => apply({ ...filters, medicine: e.target.value })}
              className={INPUT}
            >
              <option value="">All</option>
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={LABEL}>Movement</span>
            <select
              value={filters.kind}
              onChange={(e) => apply({ ...filters, kind: e.target.value })}
              className={INPUT}
            >
              <option value="">All</option>
              {MOVEMENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={LABEL}>From</span>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => apply({ ...filters, from: e.target.value })}
                className={INPUT}
              />
            </label>
            <label>
              <span className={LABEL}>To</span>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => apply({ ...filters, to: e.target.value })}
                className={INPUT}
              />
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="default" size="default"
 onClick={() => apply(filters)}

 >
            Apply
          </Button>
          <Button variant="outline" size="default"
 onClick={() => {
 const blank = { medicine: "", kind: "", from: "", to: "", q: "" }
 setFilters(blank)
 apply(blank)
 }}

 >
            Clear
          </Button>
          <Button variant="outline" size="default" className="ml-auto"
 onClick={download}
 disabled={exporting}

 >
            {exporting ? <PredictSpinner className="size-4" /> : <Download className="h-3.5 w-3.5" />}
            Download CSV
          </Button>
        </div>
      </div>

      <p className="text-xs text-black/60 dark:text-white/40">
        {total.toLocaleString("en-IN")} movement{total === 1 ? "" : "s"}
        {total > 0 && ` · showing ${offset + 1}–${Math.min(offset + PAGE, total)}`}
      </p>

      <div className="overflow-x-auto rounded-md border border-black/18 dark:border-white/10">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-black/18 bg-black/[0.02] text-left text-xs text-black/65 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/45">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Medicine</th>
              <th className="px-3 py-2 font-medium">Movement</th>
              <th className="px-3 py-2 text-right font-medium">Quantity</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center">
                  <PredictSpinner className="size-4" />
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-black/60 dark:text-white/40">
                  No movements match that.
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((r) => (
                <tr key={r.id} className="border-b border-black/12 last:border-0 dark:border-white/5">
                  <td className="whitespace-nowrap px-3 py-2 text-black/70 dark:text-white/55">
                    {new Date(r.occurredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                    <span className="block text-[11px] text-black/60 dark:text-white/40">
                      {new Date(r.occurredAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{r.medicineName}</td>
                  <td className="px-3 py-2 text-black/70 dark:text-white/55">
                    {KIND_LABEL.get(r.kind) ?? r.kind}
                    {/* A consumption tied to a therapy day was taken by the
                        system, not typed by anyone — worth saying so. */}
                    {r.sittingId && (
                      <span className="block text-[11px] text-black/60 dark:text-white/40">therapy session</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <span className="flex items-center justify-end gap-1.5 font-medium tabular-nums">
                      {r.quantity >= 0 ? (
                        <ArrowUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ArrowDown className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                      )}
                      {qty(Math.abs(r.quantity))}
                      <span className="text-black/60 dark:text-white/40">{r.unit}</span>
                    </span>
                    {r.unitCostInPaise !== null && (
                      <span className="block text-[11px] text-black/60 dark:text-white/40">
                        {rupees(r.unitCostInPaise)} each
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-black/70 dark:text-white/55">{r.contactName ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-black/60 dark:text-white/40">
                    {[r.batchNo && `Batch ${r.batchNo}`, r.note, r.actorName && `by ${r.actorName}`]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm"
 onClick={() => setOffset(Math.max(0, offset - PAGE))}
 disabled={offset === 0}

 >
            Previous
          </Button>
          <span className="text-xs text-black/60 dark:text-white/40">
            Page {page} of {pages}
          </span>
          <Button variant="outline" size="sm"
 onClick={() => setOffset(offset + PAGE)}
 disabled={offset + PAGE >= total}

 >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

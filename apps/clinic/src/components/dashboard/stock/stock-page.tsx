"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react"
import { directionOf, MOVEMENT_KINDS, MEDICINE_UNITS } from "@workspace/db/stock-service"
import { StockHistory } from "./stock-history"
import { StockReport } from "./stock-report"
import { INPUT, LABEL, qty } from "./stock-styles"

interface Level {
  id: string
  /** A combo. Holds no stock of its own — the medicines inside it do. */
  isKit: boolean
  components: { medicineId: string; name: string; quantity: number }[]
  name: string
  sku: string | null
  unit: string
  perSittingQty: number | null
  reorderLevel: number
  /** Counter price of one unit, paise. 0 = not set. */
  rateInPaise: number
  isActive: boolean
  onHand: number
  low: boolean
  negative: boolean
}

interface ForecastRow {
  medicineId: string
  name: string
  unit: string
  onHand: number
  perSittingQty: number
  sittings: number
  required: number
  afterwards: number
  short: boolean
}

interface Movement {
  id: string
  kind: string
  quantity: number
  batchNo: string | null
  note: string | null
  occurredAt: string
}

const BLANK_MED = {
  id: "",
  name: "",
  sku: "",
  unit: "piece",
  perSittingQty: "",
  reorderLevel: "0",
  rate: "",
  notes: "",
}

/**
 * The storeroom.
 *
 * On-hand is the sum of every movement ever recorded, not a counter — so the
 * number on this page and the history behind it cannot disagree. Opening stock
 * is a movement like any other, which is why there is no separate field for it:
 * the count the clinic starts from is the first entry in the ledger.
 *
 * The forecast is the part that earns the page. "You have 40 sachets" is not
 * actionable on its own; "the week ahead needs 55" is.
 */
type Tab = "shelf" | "history" | "reports"

const TABS: { id: Tab; label: string }[] = [
  { id: "shelf", label: "Shelf" },
  { id: "history", label: "History" },
  { id: "reports", label: "Reports" },
]

export function StockPage() {
  const [tab, setTab] = useState<Tab>("shelf")
  const [levels, setLevels] = useState<Level[]>([])
  const [forecast, setForecast] = useState<ForecastRow[]>([])
  const [forecastTo, setForecastTo] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState<typeof BLANK_MED | null>(null)
  const [moveFor, setMoveFor] = useState<Level | null>(null)
  const [move, setMove] = useState({
    kind: "purchase",
    quantity: "",
    batchNo: "",
    note: "",
    negative: false,
    unitCostInRupees: "",
    expiresOn: "",
  })
  const [ledgerFor, setLedgerFor] = useState<Level | null>(null)
  const [ledger, setLedger] = useState<Movement[]>([])

  const load = useCallback(async () => {
    const res = await fetch("/api/staff/stock?days=7")
    const data = await res.json().catch(() => null)
    setLevels(data?.levels ?? [])
    setForecast(data?.forecast?.rows ?? [])
    setForecastTo(data?.forecast?.to ?? "")
  }, [])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const saveMedicine = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy("medicine")
    setError(null)
    try {
      const res = await fetch("/api/staff/stock", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing.id ? editing : { ...editing, id: undefined }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not save that medicine")
        return
      }
      setEditing(null)
      await load()
    } finally {
      setBusy(null)
    }
  }

  const saveMovement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!moveFor) return
    setBusy("move")
    setError(null)
    try {
      const res = await fetch("/api/staff/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ medicineId: moveFor.id, ...move }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not record that movement")
        return
      }
      setMoveFor(null)
      setMove({
    kind: "purchase",
    quantity: "",
    batchNo: "",
    note: "",
    negative: false,
    unitCostInRupees: "",
    expiresOn: "",
  })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const openLedger = async (level: Level) => {
    setLedgerFor(level)
    const res = await fetch(`/api/staff/stock?medicineId=${level.id}`)
    const data = await res.json().catch(() => null)
    setLedger(data?.movements ?? [])
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  // Combos are packaging, not stock: the shelf lists only what can actually
  // run out. The one thing worth saying about a combo is when it is empty,
  // because therapy on it then draws nothing at all.
  const stockItems = levels.filter((l) => !l.isKit)
  const emptyCombos = levels.filter((l) => l.isKit && l.components.length === 0).length

  const lowCount = stockItems.filter((l) => l.low || l.negative).length
  const shortCount = forecast.filter((f) => f.short).length
  const noRate = stockItems.filter((l) => l.isActive && l.perSittingQty === null).length

  return (
    <div className="flex w-full flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Medicine stock</h1>
        </div>
        {tab === "shelf" && (
        <Button variant="default" size="lg"
 onClick={() => setEditing({ ...BLANK_MED })}

 >
          <Plus className="h-4 w-4" />
          Add a medicine
        </Button>
        )}
      </div>

      {/* Three views of one ledger, not three pages: the balances, the full
          history behind them, and what it all adds up to. */}
      <div className="flex gap-1 border-b border-black/12 dark:border-white/5">
        {TABS.map((t) => (
          <Button size="sm" variant={tab === t.id ? "default" : "ghost"} className="shrink-0"
 key={t.id}
 onClick={() => setTab(t.id)}

 >
            {t.label}
          </Button>
        ))}
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {tab === "shelf" && (lowCount > 0 || shortCount > 0 || emptyCombos > 0) && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {lowCount > 0 && `${lowCount} at or below its reorder level. `}
            {shortCount > 0 && `${shortCount} will not cover the week ahead. `}
            {/* A combo with nothing inside it takes nothing off any shelf, so
                therapy on that package silently consumes nothing. */}
            {emptyCombos > 0 &&
              `${emptyCombos} combo${emptyCombos === 1 ? " has" : "s have"} no medicines listed inside, so therapy on ${emptyCombos === 1 ? "it" : "them"} takes nothing off the shelf.`}
          </span>
        </p>
      )}

      {tab === "shelf" && (
      <>
      {editing && (
        <form
          onSubmit={saveMedicine}
          className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{editing.id ? "Edit medicine" : "New medicine"}</h2>
            <Button variant="ghost" type="button" onClick={() => setEditing(null)} aria-label="Close">
              <X className="h-4 w-4 text-black/60 dark:text-white/40" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="sm:col-span-2">
              <span className={LABEL}>Name</span>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className={INPUT}
                required
              />
            </label>
            <label>
              <span className={LABEL}>Code</span>
              <input
                value={editing.sku}
                onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
                className={INPUT}
              />
            </label>
            <label>
              <span className={LABEL}>Unit</span>
              <select
                value={editing.unit}
                onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                className={INPUT}
              >
                {MEDICINE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={LABEL}>Used per session</span>
              <input
                type="number"
                step="any"
                min={0}
                value={editing.perSittingQty}
                onChange={(e) => setEditing({ ...editing, perSittingQty: e.target.value })}
                placeholder="Leave blank"
                className={INPUT}
              />
              <span className="mt-1 block text-[11px] text-black/60 dark:text-white/40">
                Blank means it is handed over as a pack, not used session by session — it then
                stays out of the forecast.
              </span>
            </label>
            <label>
              <span className={LABEL}>Price (₹ per {editing.unit || "unit"})</span>
              <input
                type="number"
                step="any"
                min={0}
                value={editing.rate}
                onChange={(e) => setEditing({ ...editing, rate: e.target.value })}
                placeholder="Counter price"
                className={INPUT}
              />
              <span className="mt-1 block text-[11px] text-black/60 dark:text-white/40">
                What it sells for on its own. A treatment plan keeps its own rate per line.
              </span>
            </label>
            <label>
              <span className={LABEL}>Warn at</span>
              <input
                type="number"
                step="any"
                min={0}
                value={editing.reorderLevel}
                onChange={(e) => setEditing({ ...editing, reorderLevel: e.target.value })}
                className={INPUT}
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="default" size="default"
 type="submit"
 disabled={busy === "medicine"}

 >
              {busy === "medicine" && <PredictSpinner className="size-4" />}
              Save
            </Button>
            <Button variant="outline" size="default"
 type="button"
 onClick={() => setEditing(null)}

 >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-md border border-black/18 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="border-b border-black/18 bg-black/[0.02] text-left text-xs text-black/65 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/45">
            <tr>
              <th className="px-3 py-2 font-medium">Medicine</th>
              <th className="px-3 py-2 text-right font-medium">On hand</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Per session</th>
              <th className="px-3 py-2 text-right font-medium">Warn at</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {stockItems.map((l) => (
              <tr
                key={l.id}
                className={`border-b border-black/12 last:border-0 dark:border-white/5 ${
                  l.isActive ? "" : "opacity-60"
                }`}
              >
                <td className="px-3 py-2">
                  <Button variant="link" size="default" className="hover:underline" onClick={() => openLedger(l)} >
                    {l.name}
                  </Button>
                  <span className="block text-xs text-black/60 dark:text-white/40">
                    {l.unit}
                    {l.sku ? ` · ${l.sku}` : ""}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`font-medium tabular-nums ${
                      l.negative
                        ? "text-red-700 dark:text-red-400"
                        : l.low
                          ? "text-amber-700 dark:text-amber-400"
                          : ""
                    }`}
                  >
                    {qty(l.onHand)}
                  </span>
                  {/* Negative means the ledger says more went out than ever came
                      in — usually a missing opening count, and worth showing
                      rather than clamping to zero. */}
                  {l.negative && (
                    <span className="block text-[11px] text-red-700 dark:text-red-400">
                      no opening count?
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-black/60 dark:text-white/40">
                  {l.rateInPaise > 0 ? `₹${(l.rateInPaise / 100).toLocaleString("en-IN")}` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-black/60 dark:text-white/40">
                  {l.perSittingQty === null ? (
                    <span title="Not consumed session by session — excluded from the forecast">—</span>
                  ) : (
                    qty(l.perSittingQty)
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-black/60 dark:text-white/40">
                  {l.reorderLevel > 0 ? qty(l.reorderLevel) : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="outline" size="sm" className="hover:bg-black/5 dark:hover:bg-white/5"
 onClick={() => {
 setMoveFor(l)
 setMove({
 kind: "purchase",
 quantity: "",
 batchNo: "",
 note: "",
 negative: false,
 unitCostInRupees: "",
 expiresOn: "",
 })
 }}

 >
                      Stock in / out
                    </Button>
                    <Button variant="ghost" size="default" className="text-black/60 hover:text-black dark:text-white/40 dark:hover:text-white"
 onClick={() =>
 setEditing({
 id: l.id,
 name: l.name,
 sku: l.sku ?? "",
 unit: l.unit,
 perSittingQty: l.perSittingQty === null ? "" : String(l.perSittingQty),
 reorderLevel: String(l.reorderLevel),
 rate: l.rateInPaise > 0 ? String(l.rateInPaise / 100) : "",
 notes: "",
 })
 }
 aria-label={`Edit ${l.name}`}

 >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {noRate > 0 && (
        <p className="text-xs text-black/60 dark:text-white/40">
          {noRate} medicine{noRate === 1 ? " has" : "s have"} no per-session amount set, so
          {noRate === 1 ? " it is" : " they are"} treated as dispensed rather than consumed and stay
          out of the forecast. Set one on each to bring it in.
        </p>
      )}

      <section className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
        <h2 className="text-sm font-semibold">The week ahead</h2>
        <p className="mb-3 text-xs text-black/60 dark:text-white/40">
          Booked in-clinic therapy days to {forecastTo || "—"}, against what is on the shelf. Days
          done at home use the pack the patient already has, so they are not counted here.
        </p>

        {forecast.length === 0 ? (
          <p className="rounded-md border border-dashed border-black/22 p-6 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/40">
            Nothing to forecast — no in-clinic sittings booked, or no medicine has a per-session
            amount set yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-black/18 text-left text-xs text-black/65 dark:border-white/10 dark:text-white/45">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Medicine</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Sessions</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Needs</th>
                  <th className="py-1.5 pr-2 text-right font-medium">On hand</th>
                  <th className="py-1.5 text-right font-medium">Left after</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((f) => (
                  <tr key={f.medicineId} className="border-b border-black/12 last:border-0 dark:border-white/5">
                    <td className="py-1.5 pr-2 font-medium">{f.name}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{f.sittings}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {qty(f.required)} {f.unit}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-black/60 dark:text-white/40">
                      {qty(f.onHand)}
                    </td>
                    <td className="py-1.5 text-right">
                      <span
                        className={`font-medium tabular-nums ${
                          f.short ? "text-red-700 dark:text-red-400" : ""
                        }`}
                      >
                        {qty(f.afterwards)}
                      </span>
                      {f.short && (
                        <span className="block text-[11px] text-red-700 dark:text-red-400">
                          order {qty(-f.afterwards)} {f.unit}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>
      )}

      {tab === "history" && (
        <StockHistory medicines={stockItems.map((l) => ({ id: l.id, name: l.name }))} />
      )}

      {tab === "reports" && <StockReport />}

      {moveFor && (
        <Modal title={`Stock in / out — ${moveFor.name}`} onClose={() => setMoveFor(null)}>
          <form onSubmit={saveMovement} className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={LABEL}>What happened</span>
              <select
                value={move.kind}
                onChange={(e) => setMove({ ...move, kind: e.target.value })}
                className={INPUT}
              >
                {MOVEMENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={LABEL}>Quantity ({moveFor.unit})</span>
              <input
                type="number"
                step="any"
                min={0}
                value={move.quantity}
                onChange={(e) => setMove({ ...move, quantity: e.target.value })}
                className={INPUT}
                required
              />
              {/* Always a positive number: the direction comes from the kind.
                  Asking a storeroom to type "-25" is how a purchase gets
                  entered as a loss. */}
              <span className="mt-1 block text-[11px] text-black/60 dark:text-white/40">
                Always positive — the kind decides the direction.
              </span>
            </label>

            <label>
              <span className={LABEL}>Batch</span>
              <input
                value={move.batchNo}
                onChange={(e) => setMove({ ...move, batchNo: e.target.value })}
                className={INPUT}
              />
            </label>

            {/* Only on the way in. A price and an expiry belong to a batch
                arriving; asking for them on a consumption would be asking the
                same fact twice and letting the two answers differ. */}
            {directionOf(move.kind) === "in" && move.kind !== "adjustment" && (
              <>
                <label>
                  <span className={LABEL}>Cost per {moveFor.unit} (₹)</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={move.unitCostInRupees}
                    onChange={(e) => setMove({ ...move, unitCostInRupees: e.target.value })}
                    placeholder="Optional"
                    className={INPUT}
                  />
                  <span className="mt-1 block text-[11px] text-black/60 dark:text-white/40">
                    What stock is worth on the reports comes from this. Left blank, the medicine
                    stays unpriced rather than counted as free.
                  </span>
                </label>
                <label>
                  <span className={LABEL}>Expires on</span>
                  <input
                    type="date"
                    value={move.expiresOn}
                    onChange={(e) => setMove({ ...move, expiresOn: e.target.value })}
                    className={INPUT}
                  />
                  <span className="mt-1 block text-[11px] text-black/60 dark:text-white/40">
                    Needs a batch number to be tracked — the expiry warning is per batch.
                  </span>
                </label>
              </>
            )}

            {move.kind === "adjustment" && (
              <label className="flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={move.negative}
                  onChange={(e) => setMove({ ...move, negative: e.target.checked })}
                />
                <span className="text-sm">The count found less than the ledger says</span>
              </label>
            )}

            <label className="sm:col-span-2">
              <span className={LABEL}>Note</span>
              <input
                value={move.note}
                onChange={(e) => setMove({ ...move, note: e.target.value })}
                placeholder="Supplier, reason, whatever will be wanted later"
                className={INPUT}
              />
            </label>

            <div className="flex gap-2 sm:col-span-2">
              <Button variant="default" size="default"
 type="submit"
 disabled={busy === "move"}

 >
                {busy === "move" && <PredictSpinner className="size-4" />}
                Record
              </Button>
              <Button variant="outline" size="default"
 type="button"
 onClick={() => setMoveFor(null)}

 >
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {ledgerFor && (
        <Modal title={`Movements — ${ledgerFor.name}`} onClose={() => setLedgerFor(null)}>
          {ledger.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/40">
              Nothing recorded yet. Start with an opening stock entry.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {ledger.map((m) => (
                  <tr key={m.id} className="border-b border-black/12 last:border-0 dark:border-white/5">
                    <td className="py-1.5 pr-2">
                      <span className="flex items-center gap-1.5">
                        {m.quantity >= 0 ? (
                          <ArrowUp className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <ArrowDown className="h-3 w-3 text-amber-600" />
                        )}
                        <span className="tabular-nums">{qty(Math.abs(m.quantity))}</span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-xs capitalize text-black/60 dark:text-white/40">
                      {m.kind.replace("_", " ")}
                      {m.batchNo ? ` · ${m.batchNo}` : ""}
                      {m.note ? ` · ${m.note}` : ""}
                    </td>
                    <td className="py-1.5 text-right text-xs text-black/60 dark:text-white/40">
                      {new Date(m.occurredAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-md border border-black/18 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-black">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-black/60 dark:text-white/40" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Home, Stethoscope, TriangleAlert } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"

function todayInClinic(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10)
}

const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })

interface Line {
  medicineId: string
  name: string
  unit: string
  allotted: number
  given: number
  left: number
}

export interface ExtraToSell {
  medicineId: string
  quantity: number
}

/**
 * Give medicine out of a patient's package — a box opened at the clinic for
 * their therapy, or taken home. Both come out of the same allotment: 6 boxes
 * in the package is 6 boxes, wherever they were used. Asking for more than is
 * left is not allowed here; the extra is sold on its own bill (onSellExtra).
 *
 * Dated: today by default, or an earlier day — medicine given before it was
 * entered, or before the system, is written up under the day it was given.
 */
export function IssueMedicineDialog({
  enrollmentId,
  planName,
  onClose,
  onIssued,
  onSellExtra,
}: {
  enrollmentId: string
  planName: string
  onClose: () => void
  onIssued: () => void
  /** Opens Sell medicine with what the package could not cover. */
  onSellExtra?: (extra: ExtraToSell[]) => void
}) {
  const [lines, setLines] = useState<Line[] | null>(null)
  const [wanted, setWanted] = useState<Record<string, string>>({})
  const [purpose, setPurpose] = useState<"clinic" | "home">("clinic")
  const today = todayInClinic()
  const [date, setDate] = useState(today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/staff/enrollments/${enrollmentId}/issue`)
      .then((r) => r.json())
      .then((d) => setLines(d?.lines ?? []))
      .catch(() => setLines([]))
  }, [enrollmentId])

  const ask = (id: string) => {
    const n = Math.floor(Number(wanted[id] ?? 0))
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const fromPackage = (l: Line) => Math.min(ask(l.medicineId), l.left)
  const over = (lines ?? []).map((l) => ({ line: l, extra: ask(l.medicineId) - l.left })).filter((x) => x.extra > 0)
  const total = (lines ?? []).reduce((n, l) => n + fromPackage(l), 0)

  async function issue() {
    if (!lines) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/enrollments/${enrollmentId}/issue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          lines: lines
            .filter((l) => fromPackage(l) > 0)
            .map((l) => ({ medicineId: l.medicineId, quantity: fromPackage(l), purpose })),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not issue the medicine")
        return
      }
      toast.success(
        `${total} issued from the package — ${purpose === "clinic" ? "opened at clinic" : "taken home"}${date !== today ? `, on ${dayLabel(date)}` : ""}`,
      )
      onIssued()
      // Whatever the package could not cover is a purchase, on its own bill.
      if (over.length && onSellExtra) onSellExtra(over.map((x) => ({ medicineId: x.line.medicineId, quantity: x.extra })))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Issue medicine from the package</DialogTitle>
          <DialogDescription>{planName} — counts against what the package allots, at the clinic or for home.</DialogDescription>
        </DialogHeader>

        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">Given on</span>
            <span className="block text-xs text-muted-foreground">
              {date === today ? "Today" : "Written up for an earlier day"}
            </span>
          </span>
          <Input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value || today)}
            className="h-9 w-40"
            aria-label="Date given"
          />
        </label>

        {/* Where it went. Both draw on the same allotment. */}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { key: "clinic", icon: Stethoscope, title: "Opened at clinic", sub: "For the therapy" },
              { key: "home", icon: Home, title: "Taken home", sub: "Handed to the patient" },
            ] as const
          ).map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={purpose === o.key}
              onClick={() => setPurpose(o.key)}
              className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors ${
                purpose === o.key ? "border-primary bg-primary/10" : "border-border hover:border-ring"
              }`}
            >
              <o.icon className="h-5 w-5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">{o.title}</span>
                <span className="block text-xs text-muted-foreground">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>

        {lines === null ? (
          <div className="flex justify-center py-6">
            <PredictSpinner />
          </div>
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">This package has no medicine lines.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Medicine</th>
                  <th className="px-2 py-2 text-right font-medium">Given</th>
                  <th className="px-2 py-2 text-right font-medium">Left</th>
                  <th className="px-3 py-2 text-right font-medium">Give now</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const extra = ask(l.medicineId) - l.left
                  return (
                    <tr key={l.medicineId} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className="font-medium">{l.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {l.allotted} {l.unit} in package
                        </span>
                        {extra > 0 && (
                          <span className="mt-0.5 block text-[11px] text-amber-700 dark:text-amber-400">
                            {l.left} from package · {extra} to be sold
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{l.given}</td>
                      <td className={`px-2 py-2 text-right font-semibold tabular-nums ${l.left === 0 ? "text-muted-foreground" : ""}`}>{l.left}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={wanted[l.medicineId] ?? ""}
                          placeholder="0"
                          onChange={(e) => setWanted((w) => ({ ...w, [l.medicineId]: e.target.value }))}
                          className="ml-auto h-9 w-20 text-right"
                          aria-label={`${l.name} to give`}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {over.length > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              More than the package has left. What it covers is issued now; the rest (
              {over.map((x) => `${x.line.name} × ${x.extra}`).join(", ")}) opens in Sell medicine to bill — paid now or added to their dues.
            </span>
          </p>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {total === 0 && over.length > 0 && onSellExtra ? (
            <Button
              onClick={() => {
                onSellExtra(over.map((x) => ({ medicineId: x.line.medicineId, quantity: x.extra })))
                onClose()
              }}
            >
              Sell {over.length === 1 ? "it" : "them"}
            </Button>
          ) : (
            <Button onClick={issue} disabled={busy || total === 0}>
              {busy && <PredictSpinner className="size-4" />}
              Issue {total > 0 ? total : ""} from package
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import { Clock, Pill, Plus, Printer, X } from "lucide-react"
import { PAYMENT_METHODS } from "@workspace/db/payment"
import { formatPrice } from "@workspace/db/treatment-plan"
import { lineAmounts } from "@workspace/db/medicine-bill-math"
import { toast } from "@workspace/ui/components/sonner"
import { duesChanged } from "./patient-dues"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { PredictSpinner } from "@/src/components/predict-loader"
import { useMe } from "@/src/lib/use-me"

const PAYMENT_METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]))

interface CatalogItem {
  id: string
  name: string
  unit: string
  isKit: boolean
  rateInPaise: number | null
}

interface SaleLine {
  key: string
  medicineId: string
  quantity: string
  rateInRupees: string
  /** "" for none, else percent or amount. */
  discountType: "" | "percent" | "amount"
  discountValue: string
}

interface Receipt {
  id: string
  kind: string
  amountInPaise: number
  method: string
  note: string | null
  receiptNo: string | null
  voidedAt: string | null
  voidReason: string | null
  collectedAt: string
  appointmentId: string | null
}

const KIND_LABEL: Record<string, string> = {
  consultation: "Consultation",
  treatment_plan: "Treatment plan",
  blood_test: "Blood test",
  medicine: "Medicine",
}

const DISCOUNT_ITEMS = { none: "No discount", percent: "% off", amount: "₹ off" }

function blankLine(): SaleLine {
  return { key: crypto.randomUUID(), medicineId: "", quantity: "1", rateInRupees: "", discountType: "", discountValue: "" }
}

/** What a typed line comes to — the same sum the server charges. */
function amountsOf(line: SaleLine) {
  const rate = Number(line.rateInRupees)
  const qty = Number(line.quantity)
  if (!Number.isFinite(rate) || !Number.isFinite(qty) || rate < 0 || qty < 1) {
    return { grossInPaise: 0, discountInPaise: 0, amountInPaise: 0 }
  }
  return lineAmounts({
    quantity: Math.floor(qty),
    rateInPaise: Math.round(rate * 100),
    discountType: line.discountType || null,
    discountValue: Number(line.discountValue) || 0,
  })
}

/** Whether the signed-in account may take money at all. */
export function useCanSell(): boolean {
  const me = useMe()
  return Boolean(me?.permissions.includes("clinic.billing"))
}

/**
 * Selling medicine: pick what was handed over, how many, at what rate, any
 * discount on each line — then take the money now, or put it on the patient's
 * dues to be paid later (with their course, often). The shelf loses it either
 * way.
 *
 * Used at a visit (the appointment page) and over the counter (a patient's
 * Treatment → Medicines). Without `appointmentId` it is a counter sale — for
 * the many people who come in only to buy medicine.
 */
export function MedicineSaleForm({
  contactId,
  appointmentId,
  onSold,
  onCancel,
  initialLines,
}: {
  contactId: string
  appointmentId?: string | null
  /** Lines to start from — what a package could not cover, handed over by Issue medicine. */
  initialLines?: { medicineId: string; quantity: number }[]
  /** The receipt's payment id, or null when the bill went on the dues. */
  onSold: (paymentId: string | null) => void
  onCancel: () => void
}) {
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null)
  // What the closed picker shows for a chosen medicine. Base UI's Select shows
  // the raw value — the medicine's id — unless it is told the label.
  const medicineLabels = useMemo(
    () =>
      Object.fromEntries(
        (catalog ?? []).map((item) => [
          item.id,
          `${item.name}${item.isKit ? " (combo)" : ""}${item.rateInPaise ? ` - ${formatPrice(item.rateInPaise)}` : ""}`,
        ]),
      ),
    [catalog],
  )
  const [lines, setLines] = useState<SaleLine[]>([blankLine()])
  const [method, setMethod] = useState("cash")
  const [reference, setReference] = useState("")
  const [busy, setBusy] = useState<"" | "now" | "later">("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/staff/payments?view=medicines")
      .then((r) => r.json().catch(() => null))
      .then((d) => setCatalog(d?.medicines ?? []))
      .catch(() => setCatalog([]))
  }, [])

  // Prefilled lines take their rate from the catalogue once it has loaded.
  useEffect(() => {
    if (!catalog || !initialLines?.length) return
    setLines(
      initialLines.map((l) => {
        const item = catalog.find((m) => m.id === l.medicineId)
        return {
          ...blankLine(),
          medicineId: l.medicineId,
          quantity: String(l.quantity),
          rateInRupees: item?.rateInPaise ? String(Math.round(item.rateInPaise / 100)) : "",
        }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog])

  const choose = (key: string, medicineId: string) => {
    const item = catalog?.find((m) => m.id === medicineId)
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? { ...line, medicineId, rateInRupees: item?.rateInPaise ? String(Math.round(item.rateInPaise / 100)) : "" }
          : line,
      ),
    )
  }
  const edit = (key: string, patch: Partial<SaleLine>) =>
    setLines((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const totals = lines.reduce(
    (sum, line) => {
      const a = amountsOf(line)
      return { gross: sum.gross + a.grossInPaise, discount: sum.discount + a.discountInPaise, total: sum.total + a.amountInPaise }
    },
    { gross: 0, discount: 0, total: 0 },
  )

  const submit = async (payNow: boolean) => {
    const filled = lines.filter((line) => line.medicineId)
    if (!filled.length) return setError("Pick a medicine.")
    setBusy(payNow ? "now" : "later")
    setError(null)
    try {
      const res = await fetch("/api/staff/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "medicine",
          appointmentId: appointmentId || null,
          contactId,
          payNow,
          method,
          reference,
          lines: filled.map((line) => ({
            medicineId: line.medicineId,
            quantity: Number(line.quantity),
            rateInRupees: line.rateInRupees,
            discountType: line.discountType || null,
            discountValue: line.discountType ? Number(line.discountValue) || 0 : 0,
          })),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not record that sale")
        return
      }
      if (!payNow) toast.success(`${formatPrice(totals.total)} added to the patient's dues`)
      setLines([blankLine()])
      setReference("")
      duesChanged()
      onSold(data?.payment?.id ?? null)
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-sm font-medium">Sell medicine</p>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {catalog === null ? (
        <div className="flex justify-center py-6">
          <PredictSpinner className="size-5" />
        </div>
      ) : catalog.length === 0 ? (
        <p className="text-sm text-muted-foreground">No medicines are on the list yet. Add them under Medicine stock first.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {lines.map((line) => {
            const a = amountsOf(line)
            return (
              <div
                key={line.key}
                className="grid items-end gap-2 rounded-lg border border-border/60 bg-background/60 p-2 sm:grid-cols-[minmax(0,1fr)_4rem_5.5rem_7.5rem_4.5rem_5.5rem_2rem] sm:border-0 sm:bg-transparent sm:p-0"
              >
                <div className="flex flex-col gap-1.5">
                  <Label>Medicine</Label>
                  <Select items={medicineLabels} value={line.medicineId} onValueChange={(value) => choose(line.key, String(value))}>
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue placeholder="Pick one" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          disabled={lines.some((other) => other.key !== line.key && other.medicineId === item.id)}
                        >
                          {item.name}
                          {item.isKit ? " (combo)" : ""}
                          {item.rateInPaise ? ` - ${formatPrice(item.rateInPaise)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Qty</Label>
                  <Input type="number" min={1} className="h-8 text-xs" value={line.quantity} onChange={(e) => edit(line.key, { quantity: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Rate (₹)</Label>
                  <Input type="number" min={0} className="h-8 text-xs" value={line.rateInRupees} onChange={(e) => edit(line.key, { rateInRupees: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Discount</Label>
                  <Select
                    items={DISCOUNT_ITEMS}
                    value={line.discountType || "none"}
                    onValueChange={(value) =>
                      edit(line.key, { discountType: value === "percent" || value === "amount" ? value : "", discountValue: "" })
                    }
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No discount</SelectItem>
                      <SelectItem value="percent">% off</SelectItem>
                      <SelectItem value="amount">₹ off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{line.discountType === "percent" ? "%" : "₹"}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={line.discountType === "percent" ? 100 : undefined}
                    className="h-8 text-xs"
                    value={line.discountValue}
                    disabled={!line.discountType}
                    placeholder="0"
                    onChange={(e) => edit(line.key, { discountValue: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Amount</Label>
                  <p className="flex h-8 flex-col justify-center text-right text-xs tabular-nums">
                    <span className="font-medium">{formatPrice(a.amountInPaise)}</span>
                    {a.discountInPaise > 0 && <span className="text-[10px] text-muted-foreground line-through">{formatPrice(a.grossInPaise)}</span>}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setLines((current) => (current.length === 1 ? [blankLine()] : current.filter((row) => row.key !== line.key)))}
                  aria-label="Remove medicine"
                >
                  <X />
                </Button>
              </div>
            )
          })}

          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setLines((current) => [...current, blankLine()])}>
            <Plus />
            Another medicine
          </Button>

          <div className="flex flex-col gap-0.5 border-t pt-2 text-sm tabular-nums">
            {totals.discount > 0 && (
              <>
                <p className="flex justify-between text-xs text-muted-foreground">
                  <span>Before discount</span>
                  <span>{formatPrice(totals.gross)}</span>
                </p>
                <p className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400">
                  <span>Discount</span>
                  <span>− {formatPrice(totals.discount)}</span>
                </p>
              </>
            )}
            <p className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatPrice(Math.max(0, totals.total))}</span>
            </p>
          </div>

          <div className="grid items-end gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label>Paid by</Label>
              <Select items={PAYMENT_METHOD_LABELS} value={method} onValueChange={(value) => setMethod(String(value))}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI or slip number" className="h-8 text-xs" />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Two ways out: paid now, or owed. Owed goes on their dues with
              anything left on their course, and is collected from there. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => submit(false)} disabled={Boolean(busy) || totals.total <= 0}>
              {busy === "later" && <PredictSpinner className="size-4" />}
              <Clock />
              Add to dues — pay later
            </Button>
            <Button type="button" variant="simple" onClick={() => submit(true)} disabled={Boolean(busy)}>
              {busy === "now" && <PredictSpinner className="size-4" />}
              Take payment {totals.total > 0 ? formatPrice(totals.total) : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** "Recorded — Open receipt", shown once a sale is taken. */
export function SaleRecorded({ paymentId }: { paymentId: string }) {
  return (
    <p className="text-xs text-emerald-800 dark:text-emerald-300">
      Recorded.{" "}
      <a href={`/receipt/${paymentId}`} target="_blank" rel="noreferrer" className="font-medium underline">
        Open receipt
      </a>
    </p>
  )
}

/**
 * Everything this person has paid, with medicine as its own action.
 *
 * The tab is the ledger. Selling medicine is a counter job that only some
 * visits need, so it stays behind a button instead of sitting on top of
 * every receipt.
 */
export function MedicineSale({ appointmentId, contactId }: { appointmentId: string; contactId: string }) {
  const canSell = useCanSell()
  const [payments, setPayments] = useState<Receipt[]>([])
  const [selling, setSelling] = useState(false)
  const [loading, setLoading] = useState(true)
  const [doneId, setDoneId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/payments?contactId=${contactId}&appointmentId=${appointmentId}`)
    const data = await res.json().catch(() => null)
    setPayments((data?.payments ?? []).filter((p: Receipt) => p.kind !== "consultation"))
  }, [appointmentId, contactId])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  if (!canSell) return null

  return (
    <Card size="sm" className="rounded-lg [--card-spacing:--spacing(3)]">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Receipts</CardTitle>
        {!selling && (
          <Button type="button" size="sm" onClick={() => setSelling(true)}>
            <Pill />
            Sell medicine
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {selling && (
          <MedicineSaleForm
            contactId={contactId}
            appointmentId={appointmentId}
            onCancel={() => setSelling(false)}
            onSold={async (id) => {
              setDoneId(id)
              setSelling(false)
              await load()
            }}
          />
        )}

        {doneId && !selling && <SaleRecorded paymentId={doneId} />}

        {loading ? (
          <div className="flex justify-center py-6">
            <PredictSpinner className="size-5" />
          </div>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No medicine or other receipts yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8">Receipt</TableHead>
                <TableHead className="h-8">For</TableHead>
                <TableHead className="h-8 text-right">Amount</TableHead>
                <TableHead className="h-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <span className={`font-mono text-xs ${p.voidedAt ? "line-through opacity-60" : ""}`}>{p.receiptNo ?? "-"}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {new Date(p.collectedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {p.appointmentId === appointmentId ? " · this visit" : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-normal">
                    <span>
                      {KIND_LABEL[p.kind] ?? p.kind.replace(/_/g, " ")} · {p.method}
                    </span>
                    {p.note && <span className="block">{p.note}</span>}
                    {p.voidedAt && <span className="block text-destructive">cancelled{p.voidReason ? ` - ${p.voidReason}` : ""}</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`font-medium tabular-nums ${p.voidedAt ? "line-through opacity-60" : ""}`}>{formatPrice(p.amountInPaise)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" size="sm" nativeButton={false} render={<a href={`/receipt/${p.id}`} target="_blank" rel="noreferrer" />}>
                      <Printer />
                      Receipt
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

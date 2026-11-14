"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { toast } from "@workspace/ui/components/sonner"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useState } from "react"
import { Landmark, TriangleAlert, UserRound, XCircle } from "lucide-react"
import { CASH_DEPOSIT_VIA_LABEL } from "@workspace/db/expense"
import {
  ListPagination,
  usePaged,
} from "@/src/components/dashboard/list-pagination"
import { formatPrice } from "@workspace/db/treatment-plan"
import { CARD, MUTED, day, shortDate } from "./billing-ui"

export interface CashDepositRow {
  id: string
  depositedOn: string
  amountInPaise: number
  via: string
  personName: string | null
  reference: string | null
  note: string | null
  voided: boolean
  voidReason: string | null
  enteredBy: string | null
}

/**
 * Cash that left the drawer for the clinic's bank account — not an expense,
 * so it lowers the drawer and leaves the profit alone.
 */
export function CashDepositList({
  rows,
  totalInPaise,
  canVoid,
  onVoid,
}: {
  rows: CashDepositRow[]
  totalInPaise: number
  canVoid: boolean
  onVoid: (d: CashDepositRow) => void
}) {
  const paged = usePaged(rows)
  if (rows.length === 0) return null
  return (
    <>
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center justify-between gap-2 border-b border-black/12 px-4 py-3 dark:border-white/5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Landmark className="h-4 w-4" /> Cash to bank{" "}
            <span className={`font-normal ${MUTED}`}>{rows.length}</span>
          </h3>
          <span className="text-sm font-semibold tabular-nums">
            {formatPrice(totalInPaise)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead
              className={`border-b border-black/12 text-left text-xs dark:border-white/5 ${MUTED}`}
            >
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">How</th>
                <th className="px-3 py-2 font-medium">Slip / UTR</th>
                <th className="px-3 py-2 font-medium">Entered by</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {paged.shown.map((d) => (
                <tr
                  key={d.id}
                  className={`border-b border-black/8 last:border-0 dark:border-white/5 ${d.voided ? "opacity-60" : ""}`}
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    {shortDate(d.depositedOn)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">
                      {d.via === "person"
                        ? `Through ${d.personName ?? "a person"}`
                        : "At the bank"}
                    </span>
                    {d.note && (
                      <span
                        className={`block max-w-[16rem] truncate text-[11px] ${MUTED}`}
                        title={d.note}
                      >
                        {d.note}
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-xs ${MUTED}`}>
                    {d.reference ?? "—"}
                  </td>
                  <td className={`px-3 py-2 text-xs ${MUTED}`}>
                    {d.enteredBy ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span
                      className={`font-medium tabular-nums ${d.voided ? "line-through" : ""}`}
                    >
                      {formatPrice(d.amountInPaise)}
                    </span>
                    {d.voided && (
                      <span
                        className="block max-w-[12rem] truncate text-[11px] text-red-700 dark:text-red-400"
                        title={d.voidReason ?? ""}
                      >
                        cancelled{d.voidReason ? ` — ${d.voidReason}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canVoid && !d.voided && (
                      <button
                        type="button"
                        onClick={() => onVoid(d)}
                        className={`inline-flex rounded p-1 hover:text-red-700 dark:hover:text-red-400 ${MUTED}`}
                        title="Cancel deposit"
                        aria-label="Cancel this deposit"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ListPagination {...paged.bar} />
    </>
  )
}

export function AddCashDepositDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [depositedOn, setDepositedOn] = useState(day(0))
  const [amount, setAmount] = useState("")
  const [via, setVia] = useState<"bank" | "person">("bank")
  const [personName, setPersonName] = useState("")
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A fresh form each time it opens.
  useEffect(() => {
    if (!open) return
    setDepositedOn(day(0))
    setAmount("")
    setVia("bank")
    setPersonName("")
    setReference("")
    setNote("")
    setError(null)
  }, [open])

  const ready =
    Number(amount) > 0 && (via === "bank" || personName.trim().length > 0)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/staff/cash-deposits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          depositedOn,
          amount,
          via,
          personName,
          reference,
          note,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not save the deposit")
        return
      }
      toast.success(
        `₹${Number(amount).toLocaleString("en-IN")} moved to the bank`
      )
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cash to bank</DialogTitle>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <div className="grid grid-cols-2 gap-2">
            {(["bank", "person"] as const).map((v) => {
              const Icon = v === "bank" ? Landmark : UserRound
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVia(v)}
                  className={`flex items-start gap-2 rounded-md border p-3 text-left text-sm transition-colors ${
                    via === v
                      ? "border-primary bg-primary/5"
                      : "border-black/12 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="font-medium">
                    {CASH_DEPOSIT_VIA_LABEL[v]}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="dep-amount">Amount (₹)</FieldLabel>
              <Input
                id="dep-amount"
                type="number"
                inputMode="decimal"
                min={1}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dep-date">Date</FieldLabel>
              <Input
                id="dep-date"
                type="date"
                value={depositedOn}
                max={day(0)}
                onChange={(e) =>
                  e.target.value && setDepositedOn(e.target.value)
                }
              />
            </Field>
          </div>

          {via === "person" && (
            <Field>
              <FieldLabel htmlFor="dep-person">Who took the cash</FieldLabel>
              <Input
                id="dep-person"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="Their name"
              />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="dep-ref">
              {via === "bank"
                ? "Deposit slip no. (optional)"
                : "UTR / transaction ref (optional)"}
            </FieldLabel>
            <Input
              id="dep-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="dep-note">Note (optional)</FieldLabel>
            <Textarea
              id="dep-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Bank, branch, anything worth remembering"
            />
          </Field>
        </FieldGroup>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!ready || busy}>
            {busy && <PredictSpinner className="size-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function VoidCashDepositDialog({
  deposit,
  onClose,
  onDone,
}: {
  deposit: CashDepositRow
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/cash-deposits/${deposit.id}/void`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not cancel it")
        return
      }
      toast.success("Deposit cancelled")
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Cancel this deposit
          </DialogTitle>
          <DialogDescription>
            It stays on the list, struck through with your reason, and the cash
            counts as in the drawer again.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-black/12 bg-black/[0.02] p-3 dark:border-white/5 dark:bg-white/[0.03]">
          <p className="text-lg font-semibold tabular-nums">
            {formatPrice(deposit.amountInPaise)}
          </p>
          <p className={`mt-0.5 text-xs ${MUTED}`}>
            {deposit.via === "person"
              ? `Through ${deposit.personName ?? "a person"}`
              : "At the bank"}{" "}
            · {shortDate(deposit.depositedOn)}
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="dep-void">Why?</FieldLabel>
          <Textarea
            id="dep-void"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Entered twice, wrong amount…"
            autoFocus
          />
        </Field>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            className="text-white"
            onClick={confirm}
            disabled={!reason.trim() || busy}
          >
            {busy && <PredictSpinner className="size-4" />}
            Cancel the deposit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

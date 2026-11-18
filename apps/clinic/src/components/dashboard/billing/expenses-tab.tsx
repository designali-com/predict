"use client"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { toast } from "@workspace/ui/components/sonner"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, Landmark, Paperclip, Plus, Repeat, Search, TriangleAlert, Wallet, XCircle } from "lucide-react"
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_HINT, EXPENSE_CATEGORY_LABEL } from "@workspace/db/expense"
import { PAYMENT_METHODS } from "@workspace/db/payment"
import { formatPrice } from "@workspace/db/treatment-plan"
import { CARD, MUTED, PRESETS, Shares, Tile, day, money, shortDate, type Split } from "./billing-ui"
import { ListPagination, type PageSize } from "@/src/components/dashboard/list-pagination"
import { AddCashDepositDialog, CashDepositList, VoidCashDepositDialog, type CashDepositRow } from "./cash-deposits"

const CATEGORY_LABEL = new Map<string, string>(Object.entries(EXPENSE_CATEGORY_LABEL))
const METHOD_LABEL = new Map<string, string>(PAYMENT_METHODS.map((m) => [m.value, m.label]))
const CATEGORY_ITEMS = { all: "All categories", ...EXPENSE_CATEGORY_LABEL }
const METHOD_ITEMS = { all: "All methods", ...Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) }
const PICK_CATEGORY = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]))
const PICK_METHOD = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]))

interface ExpenseRow {
  id: string
  spentOn: string
  category: string
  amountInPaise: number
  method: string
  paidTo: string | null
  reference: string | null
  note: string | null
  billUrl: string | null
  billName: string | null
  recurring: boolean
  voided: boolean
  voidReason: string | null
  enteredBy: string | null
}

interface Summary {
  spentInPaise: number
  entries: number
  voided: number
  byCategory: Split[]
  byMethod: Split[]
}

interface Cash {
  day: string
  cashInPaise: number
  cashInCount: number
  cashOutPaise: number
  cashOutCount: number
  toBankPaise: number
  toBankCount: number
  drawerPaise: number
}

/**
 * Money out. Anyone who takes payments can enter one; they see what they
 * entered and the drawer for the day. Admin and manager see every expense,
 * cancel a wrong one and keep the monthly repeats.
 */
export function ExpensesTab() {
  const [range, setRange] = useState(PRESETS[3]!.range())
  const [category, setCategory] = useState("")
  const [method, setMethod] = useState("")
  const [q, setQ] = useState("")
  const [query, setQuery] = useState("")
  const [cashDay, setCashDay] = useState(day(0))
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [cash, setCash] = useState<Cash | null>(null)
  const [all, setAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [voiding, setVoiding] = useState<ExpenseRow | null>(null)
  const [repeats, setRepeats] = useState(false)
  const [deposits, setDeposits] = useState<{ rows: CashDepositRow[]; totalInPaise: number }>({ rows: [], totalInPaise: 0 })
  const [depositing, setDepositing] = useState(false)
  const [voidingDeposit, setVoidingDeposit] = useState<CashDepositRow | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const params = useMemo(() => {
    const p = new URLSearchParams({ from: range.from, to: range.to })
    if (category) p.set("category", category)
    if (method) p.set("method", method)
    if (query) p.set("q", query)
    return p.toString()
  }, [range, category, method, query])

  // A new filter starts again from the first page.
  useEffect(() => setPage(1), [params, pageSize])

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/expenses?${params}&cashDay=${cashDay}&page=${page}&size=${pageSize}`)
    const data = await res.json().catch(() => null)
    setRows(data?.rows ?? [])
    setTotal(data?.total ?? 0)
    setSummary(data?.summary ?? null)
    setCash(data?.cash ?? null)
    setDeposits(data?.deposits ?? { rows: [], totalInPaise: 0 })
    setAll(Boolean(data?.all))
  }, [params, cashDay, page, pageSize])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const preset = PRESETS.find((p) => {
    const r = p.range()
    return r.from === range.from && r.to === range.to
  })?.key

  const cashOut = summary?.byMethod.find((m) => m.key === "cash")
  const top = summary?.byCategory[0]

  return (
    <div className="flex flex-col gap-4">
      {/* Filters and the two things you come here to do. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <Button key={p.key} size="sm" variant={preset === p.key ? "default" : "outline"} onClick={() => setRange(p.range())}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
            className="h-8 w-auto"
            aria-label="From"
          />
          <span className={MUTED}>–</span>
          <Input
            type="date"
            value={range.to}
            min={range.from}
            onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
            className="h-8 w-auto"
            aria-label="To"
          />
        </div>
        <Select items={CATEGORY_ITEMS} value={category || "all"} onValueChange={(v) => setCategory(v && v !== "all" ? String(v) : "")}>
          <SelectTrigger className="h-8 min-w-[11rem] text-sm" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={METHOD_ITEMS} value={method || "all"} onValueChange={(v) => setMethod(v && v !== "all" ? String(v) : "")}>
          <SelectTrigger className="h-8 min-w-[9rem] text-sm" aria-label="Paid via">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative min-w-[11rem] flex-1">
          <Search className={`pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 ${MUTED}`} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Paid to, note or ref" className="h-8 pl-8" />
        </div>
        <a
          href={`/api/staff/expenses?${params}&format=csv`}
          download
          className={buttonVariants({ size: "sm", variant: "outline", className: "gap-1.5" })}
        >
          <Download /> CSV
        </a>
        {all && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRepeats(true)}>
            <Repeat /> Monthly
          </Button>
        )}
        <Button size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
          <Plus /> Add expense
        </Button>
      </div>

      {loading && !summary ? (
        <div className={`${CARD} flex justify-center py-16`}>
          <PredictSpinner />
        </div>
      ) : (
        <>
          {cash && <CashClosing cash={cash} onDay={setCashDay} onDeposit={() => setDepositing(true)} />}

          {summary && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile
                label={all ? "Spent" : "You entered"}
                value={money(summary.spentInPaise)}
                hint={`${summary.entries} expense${summary.entries === 1 ? "" : "s"}`}
                tone={summary.spentInPaise > 0 ? "bad" : undefined}
              />
              <Tile label="Paid in cash" value={money(cashOut?.amountInPaise ?? 0)} hint="out of the drawer" />
              <Tile
                label="Biggest head"
                value={top ? money(top.amountInPaise) : "—"}
                hint={top ? (CATEGORY_LABEL.get(top.key) ?? top.key) : "nothing yet"}
              />
              <Tile
                label="Cancelled"
                value={String(summary.voided)}
                hint={summary.voided ? "kept on the list, not counted" : "none"}
                tone={summary.voided ? "warn" : undefined}
              />
            </div>
          )}

          {summary && summary.entries > 0 && (
            <div className="grid gap-3 lg:grid-cols-2">
              <Shares title="By category" rows={summary.byCategory} labels={CATEGORY_LABEL} total={summary.spentInPaise} unit="expense" />
              <Shares title="Paid via" rows={summary.byMethod} labels={METHOD_LABEL} total={summary.spentInPaise} unit="expense" />
            </div>
          )}

          {!all && (
            <p className={`text-xs ${MUTED}`}>
              You see the expenses you entered. The full list, salaries and the profit are with the admin and manager.
            </p>
          )}

          <ExpenseList rows={rows} total={total} loading={loading} canVoid={all} onVoid={setVoiding} />
          {total > 0 && <ListPagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />}

          <CashDepositList rows={deposits.rows} totalInPaise={deposits.totalInPaise} canVoid={all} onVoid={setVoidingDeposit} />
        </>
      )}

      <AddCashDepositDialog
        open={depositing}
        onClose={() => setDepositing(false)}
        onSaved={() => {
          setDepositing(false)
          void load()
        }}
      />
      {voidingDeposit && (
        <VoidCashDepositDialog
          deposit={voidingDeposit}
          onClose={() => setVoidingDeposit(null)}
          onDone={() => {
            setVoidingDeposit(null)
            void load()
          }}
        />
      )}

      <AddExpenseDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false)
          void load()
        }}
      />
      {voiding && (
        <VoidExpenseDialog
          expense={voiding}
          onClose={() => setVoiding(null)}
          onDone={() => {
            setVoiding(null)
            void load()
          }}
        />
      )}
      {all && <RecurringDialog open={repeats} onClose={() => setRepeats(false)} onChanged={() => void load()} />}
    </div>
  )
}

/* ─────────────────────────────── cash closing ─────────────────────────────── */

/** The drawer at closing: cash in, cash out, cash to bank, what should be in the till. */
function CashClosing({ cash, onDay, onDeposit }: { cash: Cash; onDay: (d: string) => void; onDeposit: () => void }) {
  return (
    <div className={`${CARD} flex flex-wrap items-center gap-x-6 gap-y-3 p-4`}>
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4" />
        <h3 className="text-sm font-semibold">Cash closing</h3>
        <Input type="date" value={cash.day} max={day(0)} onChange={(e) => e.target.value && onDay(e.target.value)} className="h-8 w-auto" />
      </div>
      <div className="flex flex-1 flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
        <span>
          <span className={MUTED}>Cash in </span>
          <b className="tabular-nums text-emerald-700 dark:text-emerald-400">{money(cash.cashInPaise)}</b>
          <span className={`text-[11px] ${MUTED}`}> · {cash.cashInCount}</span>
        </span>
        <span className={MUTED}>−</span>
        <span>
          <span className={MUTED}>Cash out </span>
          <b className="tabular-nums text-red-700 dark:text-red-400">{money(cash.cashOutPaise)}</b>
          <span className={`text-[11px] ${MUTED}`}> · {cash.cashOutCount}</span>
        </span>
        <span className={MUTED}>−</span>
        <span>
          <span className={MUTED}>To bank </span>
          <b className="tabular-nums text-sky-700 dark:text-sky-400">{money(cash.toBankPaise)}</b>
          <span className={`text-[11px] ${MUTED}`}> · {cash.toBankCount}</span>
        </span>
        <span className={MUTED}>=</span>
        <span>
          <span className={MUTED}>Should be in the drawer </span>
          <b className="text-lg tabular-nums">{money(cash.drawerPaise)}</b>
        </span>
      </div>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={onDeposit}>
        <Landmark /> Cash to bank
      </Button>
    </div>
  )
}

/* ─────────────────────────────── list ─────────────────────────────── */

function ExpenseList({
  rows,
  total,
  loading,
  canVoid,
  onVoid,
}: {
  rows: ExpenseRow[]
  total: number
  loading: boolean
  canVoid: boolean
  onVoid: (e: ExpenseRow) => void
}) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-center justify-between gap-2 border-b border-black/12 px-4 py-3 dark:border-white/5">
        <h3 className="text-sm font-semibold">
          Expenses <span className={`font-normal ${MUTED}`}>{total}</span>
        </h3>
        {loading && <PredictSpinner />}
      </div>
      {rows.length === 0 ? (
        <p className={`p-8 text-center text-sm ${MUTED}`}>No expenses here yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className={`border-b border-black/12 text-left text-xs dark:border-white/5 ${MUTED}`}>
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Paid to</th>
                <th className="px-3 py-2 font-medium">Via</th>
                <th className="px-3 py-2 font-medium">Entered by</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.id}
                  className={`border-b border-black/8 last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03] ${
                    e.voided ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-4 py-2 whitespace-nowrap">{shortDate(e.spentOn)}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="rounded border border-black/12 px-1.5 py-0.5 dark:border-white/10">
                      {CATEGORY_LABEL.get(e.category) ?? e.category}
                    </span>
                    {e.recurring && (
                      <span className={`ml-1 inline-flex items-center gap-0.5 text-[11px] ${MUTED}`} title="Entered by a monthly repeat">
                        <Repeat className="h-3 w-3" /> monthly
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{e.paidTo ?? "—"}</span>
                    {e.note && <span className={`block max-w-[16rem] truncate text-[11px] ${MUTED}`} title={e.note}>{e.note}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {METHOD_LABEL.get(e.method) ?? e.method}
                    {e.reference && <span className={`block max-w-[9rem] truncate text-[11px] ${MUTED}`}>{e.reference}</span>}
                  </td>
                  <td className={`px-3 py-2 text-xs ${MUTED}`}>{e.enteredBy ?? "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className={`font-medium tabular-nums ${e.voided ? "line-through" : ""}`}>{formatPrice(e.amountInPaise)}</span>
                    {e.voided && (
                      <span className="block max-w-[12rem] truncate text-[11px] text-red-700 dark:text-red-400" title={e.voidReason ?? ""}>
                        cancelled{e.voidReason ? ` — ${e.voidReason}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {e.billUrl && (
                      <a
                        href={e.billUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex rounded p-1 hover:text-black dark:hover:text-white ${MUTED}`}
                        title={e.billName ?? "Bill"}
                        aria-label="Open the bill"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {canVoid && !e.voided && (
                      <button
                        type="button"
                        onClick={() => onVoid(e)}
                        className={`inline-flex rounded p-1 hover:text-red-700 dark:hover:text-red-400 ${MUTED}`}
                        title="Cancel expense"
                        aria-label="Cancel this expense"
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
      )}
    </div>
  )
}

/* ─────────────────────────────── add ─────────────────────────────── */

function AddExpenseDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [spentOn, setSpentOn] = useState(day(0))
  const [category, setCategory] = useState("")
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("cash")
  const [paidTo, setPaidTo] = useState("")
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const [bill, setBill] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A fresh form each time it opens.
  useEffect(() => {
    if (!open) return
    setSpentOn(day(0))
    setCategory("")
    setAmount("")
    setMethod("cash")
    setPaidTo("")
    setReference("")
    setNote("")
    setBill(null)
    setError(null)
  }, [open])

  const ready = Boolean(category) && Number(amount) > 0 && (category !== "misc" || note.trim().length > 0)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.set("spentOn", spentOn)
      form.set("category", category)
      form.set("amount", amount)
      form.set("method", method)
      form.set("paidTo", paidTo)
      form.set("reference", reference)
      form.set("note", note)
      if (bill) form.set("bill", bill)
      const res = await fetch("/api/staff/expenses", { method: "POST", body: form })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not save the expense")
        return
      }
      toast.success(`Expense of ₹${Number(amount).toLocaleString("en-IN")} saved`)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add an expense</DialogTitle>
          <DialogDescription>Money that went out of the clinic. Attach the bill if there is one.</DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="exp-amount">Amount (₹)</FieldLabel>
              <Input
                id="exp-amount"
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
              <FieldLabel htmlFor="exp-date">Date paid</FieldLabel>
              <Input id="exp-date" type="date" value={spentOn} max={day(0)} onChange={(e) => e.target.value && setSpentOn(e.target.value)} />
            </Field>
          </div>

          <Field>
            <FieldLabel>Category</FieldLabel>
            <Select items={PICK_CATEGORY} value={category || null} onValueChange={(v) => setCategory(String(v ?? ""))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="What was it for?" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {category && <FieldDescription>{EXPENSE_CATEGORY_HINT[category]}</FieldDescription>}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Paid via</FieldLabel>
              <Select items={PICK_METHOD} value={method} onValueChange={(v) => setMethod(String(v ?? "cash"))}>
                <SelectTrigger className="w-full">
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
            </Field>
            <Field>
              <FieldLabel htmlFor="exp-to">Paid to</FieldLabel>
              <Input id="exp-to" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="Vendor or person" />
            </Field>
          </div>

          {method !== "cash" && (
            <Field>
              <FieldLabel htmlFor="exp-ref">Reference</FieldLabel>
              <Input id="exp-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI ref, cheque or invoice no." />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="exp-note">Note {category === "misc" ? "" : "(optional)"}</FieldLabel>
            <Textarea
              id="exp-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={category === "misc" ? "Say what it was for" : "Anything worth remembering"}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="exp-bill">Bill photo (optional)</FieldLabel>
            <Input id="exp-bill" type="file" accept="image/*,application/pdf" onChange={(e) => setBill(e.target.files?.[0] ?? null)} />
            <FieldDescription>A photo of the receipt or a PDF, up to 20 MB.</FieldDescription>
          </Field>
        </FieldGroup>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!ready || busy}>
            {busy && <PredictSpinner className="size-4" />}
            Save expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─────────────────────────────── void ─────────────────────────────── */

function VoidExpenseDialog({ expense, onClose, onDone }: { expense: ExpenseRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/expenses/${expense.id}/void`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not cancel it")
        return
      }
      toast.success("Expense cancelled")
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
            Cancel this expense
          </DialogTitle>
          <DialogDescription>It stays on the list, struck through with your reason, and stops counting.</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-black/12 bg-black/[0.02] p-3 dark:border-white/5 dark:bg-white/[0.03]">
          <p className="text-lg font-semibold tabular-nums">{formatPrice(expense.amountInPaise)}</p>
          <p className={`mt-0.5 text-xs ${MUTED}`}>
            {CATEGORY_LABEL.get(expense.category) ?? expense.category} · {expense.paidTo ?? "—"} · {shortDate(expense.spentOn)}
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="exp-void">Why?</FieldLabel>
          <Textarea id="exp-void" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Entered twice, wrong amount…" autoFocus />
        </Field>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" className="text-white" onClick={confirm} disabled={!reason.trim() || busy}>
            {busy && <PredictSpinner className="size-4" />}
            Cancel the expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─────────────────────────────── monthly repeats ─────────────────────────────── */

interface RepeatRow {
  id: string
  category: string
  amountInPaise: number
  method: string
  paidTo: string | null
  note: string | null
  dayOfMonth: number
  startsOn: string
  active: boolean
  lastMonth: string | null
}

const DAY_ITEMS = Object.fromEntries(Array.from({ length: 28 }, (_, i) => [String(i + 1), `${i + 1}${ordinal(i + 1)} of the month`]))

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th"
  return ["th", "st", "nd", "rd"][n % 10] ?? "th"
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })
}

/**
 * Rent and salaries, entered once. Each month's row is written on its day the
 * first time Billing is opened — stopping one keeps the months already entered.
 */
function RecurringDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<RepeatRow[] | null>(null)
  const [category, setCategory] = useState("")
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("bank")
  const [paidTo, setPaidTo] = useState("")
  const [note, setNote] = useState("")
  const [dayOfMonth, setDayOfMonth] = useState("1")
  const [startsOn, setStartsOn] = useState(day(0).slice(0, 7))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/staff/expenses/recurring")
    const data = await res.json().catch(() => null)
    setRows(data?.repeats ?? [])
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  async function add() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/staff/expenses/recurring", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, amount, method, paidTo, note, dayOfMonth: Number(dayOfMonth), startsOn: `${startsOn}-01` }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not save it")
        return
      }
      toast.success(data?.posted ? "Saved — this month's is entered too" : "Saved")
      setCategory("")
      setAmount("")
      setPaidTo("")
      setNote("")
      await load()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function toggle(r: RepeatRow) {
    const res = await fetch("/api/staff/expenses/recurring", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: r.id, active: !r.active }),
    })
    if (!res.ok) {
      toast.error("Could not change it")
      return
    }
    await load()
    onChanged()
  }

  const ready = Boolean(category) && Number(amount) > 0 && (category !== "misc" || note.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Monthly expenses</DialogTitle>
          <DialogDescription>
            Rent, salaries and other fixed costs. Each one is entered automatically on its day every month.
          </DialogDescription>
        </DialogHeader>

        {rows === null ? (
          <div className="flex justify-center py-6">
            <PredictSpinner />
          </div>
        ) : rows.length === 0 ? (
          <p className={`text-sm ${MUTED}`}>None yet — add the first below.</p>
        ) : (
          <ul className="divide-y divide-black/8 rounded-md border border-black/12 dark:divide-white/5 dark:border-white/10">
            {rows.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${r.active ? "" : "opacity-60"}`}>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{r.paidTo ?? CATEGORY_LABEL.get(r.category)}</span>
                  <span className={`block text-[11px] ${MUTED}`}>
                    {CATEGORY_LABEL.get(r.category)} · {METHOD_LABEL.get(r.method)} · {r.dayOfMonth}
                    {ordinal(r.dayOfMonth)} of every month
                    {r.lastMonth ? ` · last entered ${monthLabel(r.lastMonth)}` : ` · from ${monthLabel(r.startsOn.slice(0, 7))}`}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{money(r.amountInPaise)}</span>
                <Button size="sm" variant="outline" onClick={() => toggle(r)}>
                  {r.active ? "Stop" : "Restart"}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-md border border-black/12 p-3 dark:border-white/10">
          <p className="mb-3 text-sm font-semibold">Add a monthly expense</p>
          <FieldGroup className="gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>Category</FieldLabel>
                <Select items={PICK_CATEGORY} value={category || null} onValueChange={(v) => setCategory(String(v ?? ""))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Rent, salary…" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="rep-amount">Amount (₹)</FieldLabel>
                <Input id="rep-amount" type="number" inputMode="decimal" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="rep-to">Paid to</FieldLabel>
                <Input id="rep-to" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="Landlord, staff name…" />
              </Field>
              <Field>
                <FieldLabel>Paid via</FieldLabel>
                <Select items={PICK_METHOD} value={method} onValueChange={(v) => setMethod(String(v ?? "bank"))}>
                  <SelectTrigger className="w-full">
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
              </Field>
              <Field>
                <FieldLabel>Day of the month</FieldLabel>
                <Select items={DAY_ITEMS} value={dayOfMonth} onValueChange={(v) => setDayOfMonth(String(v ?? "1"))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DAY_ITEMS).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="rep-start">Starting month</FieldLabel>
                <Input id="rep-start" type="month" value={startsOn} onChange={(e) => e.target.value && setStartsOn(e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="rep-note">Note {category === "misc" ? "" : "(optional)"}</FieldLabel>
              <Input id="rep-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Receptionist salary" />
            </Field>
          </FieldGroup>
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-3 flex justify-end">
            <Button onClick={add} disabled={!ready || busy}>
              {busy && <PredictSpinner className="size-4" />}
              Add monthly expense
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

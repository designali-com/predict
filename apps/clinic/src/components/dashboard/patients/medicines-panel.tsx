"use client"

import { useEffect, useState } from "react"
import { Home, Package, PackageOpen, Pill, Plus, ShoppingBag } from "lucide-react"
import { formatPrice } from "@workspace/db/treatment-plan"
import { Button } from "@workspace/ui/components/button"
import { PredictSpinner } from "@/src/components/predict-loader"
import { MedicineSaleForm, SaleRecorded, useCanSell } from "@/src/components/dashboard/billing/medicine-sale"
import { IssueMedicineDialog, type ExtraToSell } from "./issue-medicine-dialog"
import { RecordBadge, RecordEmpty, RecordSection, RecordStat, RecordTable, recordDate } from "./record-ui"

interface AllottedItem {
  name: string
  unit: string
  isExtra: boolean
  allotted: number
  given: number
  remaining: number
}

interface Course {
  id: string
  planName: string
  status: string | null
  startDate: string | null
  items: AllottedItem[]
}

interface Purchase {
  id: string
  at: string
  receiptNo: string | null
  totalInPaise: number
  discountInPaise: number
  paidInPaise: number
  /** Taken and not yet paid for — on the patient's dues. */
  outstandingInPaise: number
  method: string | null
  items: string | null
  voidedAt: string | null
}

interface Dispensed {
  id: string
  medicineName: string
  unit: string
  kind: string
  quantity: number
  note: string | null
  occurredAt: string
}

interface Prescribed {
  id: string
  type: string
  name: string
  instructions: string | null
  slots: string[] | null
  startDate: string
  endDate: string | null
  isActive: boolean
}

interface Data {
  allotted: Course[]
  purchases: Purchase[]
  dispensed: Dispensed[]
  prescribed: Prescribed[]
}

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

const HOW: Record<string, string> = {
  dispense: "Sold",
  consumption: "Used on a sitting",
  adjustment: "Adjustment",
  expiry: "Expired",
}

/**
 * One patient's medicines, in one place: what their package allots and how
 * much of it they have had, what they bought at the counter, what left the
 * shelf for them, and what they were told to take at home.
 */
export function MedicinesPanel({
  contactId,
  onSold,
}: {
  contactId: string
  /** Told after a counter sale, so the page's own payment list (Billing) catches up. */
  onSold?: () => void
}) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [selling, setSelling] = useState(false)
  const [soldId, setSoldId] = useState<string | null>(null)
  // Issuing out of a package, and what it could not cover going to Sell medicine.
  const [issuing, setIssuing] = useState<Course | null>(null)
  const [extra, setExtra] = useState<ExtraToSell[] | undefined>(undefined)
  const canSell = useCanSell()

  useEffect(() => {
    fetch(`/api/staff/patients/${contactId}/medicines`)
      .then(async (r) => {
        const d = await r.json().catch(() => null)
        if (!r.ok) throw new Error(d?.error ?? "Could not load medicines.")
        setData(d)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load medicines."))
  }, [contactId, version])

  if (error) return <p className="py-4 text-sm text-red-600">{error}</p>
  if (!data) {
    return (
      <div className="flex justify-center py-10">
        <PredictSpinner />
      </div>
    )
  }

  const live = data.purchases.filter((p) => !p.voidedAt)
  const owed = live.reduce((sum, p) => sum + p.outstandingInPaise, 0)
  const courses = data.allotted.filter((c) => c.items.length > 0)
  const lines = courses.reduce((n, c) => n + c.items.length, 0)

  return (
    <div className="flex flex-col gap-4">
      {issuing && (
        <IssueMedicineDialog
          enrollmentId={issuing.id}
          planName={issuing.planName}
          onClose={() => setIssuing(null)}
          onIssued={() => setVersion((v) => v + 1)}
          onSellExtra={(lines) => {
            setSoldId(null)
            setExtra(lines)
            setSelling(true)
          }}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <RecordStat
          label="Bought at the counter"
          value={formatPrice(live.reduce((sum, p) => sum + p.totalInPaise, 0))}
          sub={`${live.length} bill${live.length === 1 ? "" : "s"}${owed > 0 ? ` · ${formatPrice(owed)} still to pay` : ""}`}
        />
        <RecordStat label="Allotted in packages" value={String(lines)} sub={`${courses.length} course${courses.length === 1 ? "" : "s"}`} />
        <RecordStat
          label="To take at home"
          value={String(data.prescribed.filter((p) => p.isActive && !p.endDate).length)}
          sub="active on the care plan"
        />
      </div>

      <RecordSection title="Allotted in the package" icon={Package}>
        {courses.length === 0 ? (
          <RecordEmpty>
            {data.allotted.length ? "The package on record carries no medicine lines." : "No treatment package — nothing allotted."}
          </RecordEmpty>
        ) : (
          <div className="flex flex-col gap-5">
            {courses.map((c) => (
              <div key={c.id}>
                <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium">
                  {c.planName}
                  {c.status && <RecordBadge tone={c.status === "active" ? "good" : "neutral"}>{c.status}</RecordBadge>}
                  <span className="text-xs font-normal text-black/50 dark:text-white/40">from {recordDate(c.startDate)}</span>
                  {/* A running (or finished) course hands out what it allots — a box
                      opened here for therapy or taken home, out of the same count. */}
                  {(c.status === "active" || c.status === "completed") && c.items.some((i) => i.remaining > 0) && (
                    <Button size="sm" variant="outline" className="ml-auto h-7 px-2.5 text-xs" onClick={() => setIssuing(c)}>
                      <PackageOpen className="size-3.5" /> Issue medicine
                    </Button>
                  )}
                  {c.status === "prescribed" && (
                    <span className="ml-auto text-[11px] font-normal text-black/50 dark:text-white/40">Start the course to issue medicine</span>
                  )}
                </p>
                <RecordTable
                  head={["Medicine", "Allotted", "Given", "Left"]}
                  align={["left", "right", "right", "right"]}
                  rows={c.items.map((i) => [
                    <span key="n" className="flex items-center gap-1.5">
                      {i.name}
                      {i.isExtra && <RecordBadge tone="warn">extra</RecordBadge>}
                    </span>,
                    `${qty(i.allotted)} ${i.unit}`,
                    qty(i.given),
                    <b key="l" className={i.remaining === 0 ? "text-emerald-700 dark:text-emerald-400" : ""}>
                      {qty(i.remaining)}
                    </b>,
                  ])}
                />
              </div>
            ))}
          </div>
        )}
      </RecordSection>

      <RecordSection
        title="Bought at the counter"
        icon={ShoppingBag}
        action={
          canSell &&
          !selling && (
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => {
                setSoldId(null)
                setExtra(undefined)
                setSelling(true)
              }}
            >
              <Plus className="size-3.5" /> Sell medicine
            </Button>
          )
        }
      >
        {selling && (
          <div className="mb-4">
            <MedicineSaleForm
              key={extra ? JSON.stringify(extra) : "blank"}
              contactId={contactId}
              initialLines={extra}
              onCancel={() => setSelling(false)}
              onSold={(id) => {
                setSoldId(id)
                setSelling(false)
                setVersion((v) => v + 1)
                onSold?.()
              }}
            />
          </div>
        )}
        {soldId && !selling && (
          <div className="mb-3">
            <SaleRecorded paymentId={soldId} />
          </div>
        )}
        {data.purchases.length === 0 ? (
          <RecordEmpty>No medicine bought yet.</RecordEmpty>
        ) : (
          <RecordTable
            head={["Date", "Medicines", "Total", "Paid", "Due"]}
            align={["left", "left", "right", "right", "right"]}
            rows={data.purchases.map((p) => [
              recordDate(p.at),
              <span key="i" className={p.voidedAt ? "line-through opacity-60" : ""}>
                {p.items || "—"}
                {p.receiptNo && <span className="ml-1.5 font-mono text-[10px] text-black/45 dark:text-white/35">{p.receiptNo}</span>}
                {p.discountInPaise > 0 && (
                  <span className="block text-[11px] text-black/50 dark:text-white/40">{formatPrice(p.discountInPaise)} discount</span>
                )}
              </span>,
              <span key="t" className={p.voidedAt ? "line-through opacity-60" : "font-medium"}>
                {formatPrice(p.totalInPaise)}
              </span>,
              <span key="p" className="whitespace-nowrap">
                {formatPrice(p.paidInPaise)}
                {p.method && <span className="ml-1 text-[10px] uppercase text-black/45 dark:text-white/35">{p.method}</span>}
                {p.voidedAt && (
                  <span className="ml-1.5">
                    <RecordBadge tone="bad">voided</RecordBadge>
                  </span>
                )}
              </span>,
              p.outstandingInPaise > 0 ? (
                <RecordBadge key="d" tone="warn">{formatPrice(p.outstandingInPaise)} due</RecordBadge>
              ) : (
                <span key="d" className="text-xs text-black/45 dark:text-white/35">—</span>
              ),
            ])}
          />
        )}
      </RecordSection>

      <RecordSection title="Given from stock" icon={Pill}>
        {data.dispensed.length === 0 ? (
          <RecordEmpty>Nothing has left the shelf for this patient yet.</RecordEmpty>
        ) : (
          <RecordTable
            head={["Date", "Medicine", "Qty", "How"]}
            align={["left", "left", "right", "left"]}
            rows={data.dispensed.map((d) => [
              recordDate(d.occurredAt),
              d.medicineName,
              `${qty(d.quantity)} ${d.unit}`,
              <span key="k" className="text-xs text-black/60 dark:text-white/45">
                {/* An issue from the package says so on its own; anything else by its kind. */}
                {d.note?.startsWith("Package") ? d.note : <>{HOW[d.kind] ?? d.kind}{d.note ? ` · ${d.note}` : ""}</>}
              </span>,
            ])}
          />
        )}
      </RecordSection>

      <RecordSection title="To take at home (care plan)" icon={Home}>
        {data.prescribed.length === 0 ? (
          <RecordEmpty>No medicines or supplements on the care plan.</RecordEmpty>
        ) : (
          <RecordTable
            head={["Medicine", "When", "From", "Status"]}
            rows={data.prescribed.map((p) => [
              <span key="n">
                {p.name}
                <span className="ml-1.5 text-[10px] uppercase text-black/45 dark:text-white/35">{p.type}</span>
                {p.instructions && <span className="block text-xs text-black/55 dark:text-white/40">{p.instructions}</span>}
              </span>,
              (p.slots ?? []).join(", ") || "—",
              recordDate(p.startDate),
              p.isActive && !p.endDate ? (
                <RecordBadge key="s" tone="good">
                  Active
                </RecordBadge>
              ) : (
                <span key="s" className="text-xs text-black/50 dark:text-white/40">
                  Ended {recordDate(p.endDate)}
                </span>
              ),
            ])}
          />
        )}
      </RecordSection>
    </div>
  )
}

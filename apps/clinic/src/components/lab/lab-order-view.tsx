"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Building2, CheckCircle2, FileText, Home, Upload, XCircle } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { PAYMENT_METHODS } from "@workspace/db/payment"
import { PredictSpinner } from "@/src/components/predict-loader"
import { UploadReportModal } from "@/src/components/dashboard/superadmin/appointments/upload-report-modal"
import { StageBadge, formatSlot, rupees, type LabStage } from "./lab-shared"
import { useLabHref } from "./lab-base"
import { CollectSteps } from "./collect-steps"

interface Detail {
  order: {
    id: string
    stage: LabStage
    status: string
    orderedOn: string
    collectedOn: string | null
    totalInPaise: number
    paidInPaise: number
    dueInPaise: number
    note: string | null
    cancelReason: string | null
    items: { biomarkerId: string; name: string; shortCode: string; priceInPaise: number }[]
    payments: { id: string; amountInPaise: number; method: string; receiptNo: string | null; collectedAt: string; voidedAt: string | null }[]
    reports: { id: string; fileUrl: string; fileName: string | null; uploadedAt: string }[]
    resultsIn: number
    scheduledAt: string | null
    collectionMode: string | null
    collectionAddress: string | null
    technician: string | null
    technicianUserId: string | null
    kitCode: string | null
    onTheWayAt: string | null
    sentToLabAt: string | null
    externalLab: string | null
    expectedReportOn: string | null
    labNote: string | null
    orderedBy: string | null
    createdAt: string
  }
  events: { kind: string; note: string | null; by: string | null; at: string }[]
  patient: {
    chartId: string
    userId: string | null
    code: string
    name: string
    phone: string | null
    email: string | null
    gender: string | null
    dateOfBirth: string | null
  }
  hospital: { name: string | null; partner: boolean }
}

const input =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-1.5 text-sm text-black focus:border-black/40 focus:outline-none dark:border-white/15 dark:bg-black dark:text-white"
const label = "mb-1 block text-xs font-medium text-muted-foreground"

function age(dob: string | null) {
  if (!dob) return null
  const d = new Date(dob)
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--
  return a >= 0 && a < 130 ? a : null
}

/** datetime-local value in the browser's (clinic's) time. */
function localInput(iso: string | null) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 86_400_000)
  if (!iso) d.setHours(9, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * One blood-test order, as the lab works it: book the sample (centre or home),
 * take the payment, mark the sample collected, upload and confirm the report —
 * which marks the order reported and tells the doctor who wrote it.
 */
export function LabOrderView({ id }: { id: string }) {
  const href = useLabHref()
  const [data, setData] = useState<Detail | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/lab/orders/${id}`)
    setData(res.ok ? await res.json() : null)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function act(kind: string, body: Record<string, unknown>, done: string, url = `/api/lab/orders/${id}`, method = "PATCH") {
    setBusy(kind)
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const out = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(out?.error ?? "That did not work")
        return false
      }
      toast.success(done)
      await load()
      return true
    } finally {
      setBusy(null)
    }
  }

  if (data === undefined) {
    return (
      <div className="flex justify-center py-16">
        <PredictSpinner />
      </div>
    )
  }
  if (!data) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        No such order. <Link href={href("/")} className="text-primary hover:underline">Back to orders</Link>
      </p>
    )
  }

  const { order, patient, hospital } = data
  const open = order.stage === "to_book" || order.stage === "booked"
  const years = age(patient.dateOfBirth)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={href("/")} className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Orders
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {patient.name}
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-normal">{patient.code}</span>
            <StageBadge stage={order.stage} />
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[patient.phone?.replace(/^91(?=\d{10}$)/, ""), years != null ? `${years} yrs` : null, patient.gender?.toLowerCase(), patient.email]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="flex items-center justify-end gap-1.5 font-medium">
            {hospital.name ?? "—"}
            {hospital.partner && (
              <span className="rounded bg-sky-500/15 px-1 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400">partner</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {order.orderedBy ? `Dr. ${order.orderedBy}` : "—"} · ordered{" "}
            {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </p>
        </div>
      </div>

      {order.stage === "cancelled" && (
        <p className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm">
          Cancelled{order.cancelReason ? `: ${order.cancelReason}` : ""}.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          {/* -------------------------------------------- collection */}
          <Section title="Sample collection">
            {/* Booked or on the way: where things stand, and the next step. */}
            {(order.stage === "booked" || order.stage === "on_the_way") && (
              <div className="mb-3 flex flex-col gap-3 border-b border-border pb-3">
                <p className="flex flex-wrap items-center gap-1.5 text-sm">
                  {order.collectionMode === "home" ? <Home className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                  <b>{formatSlot(order.scheduledAt!)}</b>
                  {order.collectionMode === "home" && order.collectionAddress ? ` · ${order.collectionAddress}` : " · at the centre"}
                  {order.technician && <span className="text-muted-foreground">· {order.technician}</span>}
                  {order.stage === "on_the_way" && <StageBadge stage="on_the_way" />}
                </p>
                <CollectSteps
                  canStart={order.stage === "booked" && order.collectionMode === "home"}
                  busy={busy}
                  onOnTheWay={() => act("on_the_way", { action: "on_the_way" }, "Marked on the way")}
                  onCollected={(kitCode) => act("collected", { action: "collected", kitCode }, "Sample collected")}
                  onNotCollected={(reason) => act("not_collected", { action: "not_collected", reason }, "Sent back to be booked again")}
                />
              </div>
            )}
            {open ? (
              <BookForm
                order={order}
                busy={busy === "book"}
                onBook={(b) => act("book", { action: "book", ...b }, order.scheduledAt ? "Booking updated" : "Collection booked")}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm">
                  {order.collectedOn
                    ? `Collected on ${new Date(order.collectedOn).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                    : "—"}
                  {order.collectionMode && ` · ${order.collectionMode === "home" ? "home collection" : "at the centre"}`}
                  {order.technician && ` · ${order.technician}`}
                  {order.kitCode && (
                    <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">Kit {order.kitCode}</span>
                  )}
                </p>
                {order.stage === "collected" && (
                  <SendToLabForm
                    busy={busy === "sent_to_lab"}
                    onSend={(b) => act("sent_to_lab", { action: "sent_to_lab", ...b }, "Marked sent to the lab")}
                  />
                )}
                {order.sentToLabAt && (
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                    Sent to <b>{order.externalLab}</b> on {formatSlot(order.sentToLabAt)}
                    {order.expectedReportOn &&
                      ` · report expected ${new Date(`${order.expectedReportOn}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                  </p>
                )}
              </div>
            )}
          </Section>

          {/* -------------------------------------------- report */}
          <Section
            title="Report"
            action={
              order.stage !== "cancelled" && (
                <Button size="sm" variant={order.stage === "collected" ? "default" : "outline"} onClick={() => setUploading(true)}>
                  <Upload className="h-4 w-4" /> Upload report
                </Button>
              )
            }
          >
            {order.reports.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {order.stage === "collected"
                  ? "Upload the lab's report and confirm its values — the order is then reported and the doctor is told."
                  : "No report yet."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {order.reports.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <a href={r.fileUrl} target="_blank" rel="noreferrer" className="truncate hover:underline">
                      {r.fileName ?? "Report"}
                    </a>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(r.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {order.resultsIn > 0 && (
              <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                {order.resultsIn} of {order.items.length} values confirmed.
              </p>
            )}
          </Section>

          {/* -------------------------------------------- tests */}
          <Section title={`Tests (${order.items.length})`}>
            <ul className="divide-y divide-border text-sm">
              {order.items.map((i) => (
                <li key={i.biomarkerId} className="flex items-center justify-between py-1.5">
                  <span>
                    {i.name} <span className="text-xs text-muted-foreground">{i.shortCode}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">{i.priceInPaise ? rupees(i.priceInPaise) : "—"}</span>
                </li>
              ))}
            </ul>
            {order.note && <p className="mt-2 text-xs text-muted-foreground">Doctor&apos;s note: {order.note}</p>}
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          {/* -------------------------------------------- payment */}
          <Section title="Payment">
            <dl className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <dt className="text-[11px] text-muted-foreground">Total</dt>
                <dd className="font-semibold tabular-nums">{rupees(order.totalInPaise)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">Paid</dt>
                <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{rupees(order.paidInPaise)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">Due</dt>
                <dd className={`font-semibold tabular-nums ${order.dueInPaise ? "text-amber-700 dark:text-amber-400" : ""}`}>
                  {rupees(order.dueInPaise)}
                </dd>
              </div>
            </dl>
            {order.payments.filter((p) => !p.voidedAt).length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
                {order.payments
                  .filter((p) => !p.voidedAt)
                  .map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <span>
                        {rupees(p.amountInPaise)} · {p.method.toUpperCase()}
                      </span>
                      <span className="text-muted-foreground">{p.receiptNo}</span>
                    </li>
                  ))}
              </ul>
            )}
            {order.dueInPaise > 0 && order.stage !== "cancelled" && (
              <PaymentForm
                due={order.dueInPaise}
                busy={busy === "pay"}
                onPay={(p) => act("pay", p, "Payment recorded", `/api/lab/orders/${id}/payment`, "POST")}
              />
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">Home collection payment links come with the Razorpay integration.</p>
          </Section>

          {/* -------------------------------------------- timeline */}
          <Section title="Timeline">
            <Timeline createdAt={order.createdAt} orderedBy={order.orderedBy} events={data.events} />
          </Section>

          {/* -------------------------------------------- note + cancel */}
          <Section title="Lab note">
            <NoteForm value={order.labNote} busy={busy === "note"} onSave={(note) => act("note", { action: "note", note }, "Note saved")} />
          </Section>

          {open && (
            <Button
              variant="ghost"
              className="self-start text-red-600 dark:text-red-400"
              disabled={busy !== null}
              onClick={() => {
                const reason = prompt("Why is this test being cancelled?")
                if (reason?.trim()) act("cancel", { action: "cancel", reason }, "Order cancelled")
              }}
            >
              <XCircle className="h-4 w-4" /> Cancel order
            </Button>
          )}
        </div>
      </div>

      {uploading && (
        <UploadReportModal
          open
          reportType="final"
          patientId={patient.userId ?? undefined}
          chartId={patient.chartId}
          bloodTestOrderId={order.id}
          onClose={() => setUploading(false)}
          onUploaded={() => load()}
          onEnterValues={() => {
            setUploading(false)
            toast.message("Enter the values from the patient's record in the clinic panel.")
          }}
        />
      )}
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-black/12 bg-white dark:border-white/10 dark:bg-black p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function BookForm({
  order,
  busy,
  onBook,
}: {
  order: Detail["order"]
  busy: boolean
  onBook: (b: { mode: string; at: string; address: string; technicianUserId: string }) => void
}) {
  const [mode, setMode] = useState(order.collectionMode ?? "centre")
  const [at, setAt] = useState(localInput(order.scheduledAt))
  const [address, setAddress] = useState(order.collectionAddress ?? "")
  const [technicianUserId, setTechnicianUserId] = useState(order.technicianUserId ?? "")
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[] | null>(null)

  useEffect(() => {
    fetch("/api/lab/technicians")
      .then((r) => (r.ok ? r.json() : { technicians: [] }))
      .then((d) => setTechnicians(d.technicians ?? []))
      .catch(() => setTechnicians([]))
  }, [])
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <span className={label}>Where</span>
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-0.5 text-sm">
          {[
            { v: "centre", l: "At the Predict centre", i: Building2 },
            { v: "home", l: "Home collection", i: Home },
          ].map((o) => (
            <Button key={o.v} type="button" size="sm" variant={mode === o.v ? "default" : "ghost"} onClick={() => setMode(o.v)}>
              <o.i className="h-4 w-4" /> {o.l}
            </Button>
          ))}
        </div>
      </div>
      <label>
        <span className={label}>When</span>
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={input} />
      </label>
      <label>
        <span className={label}>Field technician</span>
        <select value={technicianUserId} onChange={(e) => setTechnicianUserId(e.target.value)} className={input}>
          <option value="">{technicians === null ? "Loading…" : "Not assigned yet"}</option>
          {(technicians ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {technicians?.length === 0 && (
          <span className="mt-1 block text-[11px] text-muted-foreground">
            No technicians yet — add one on the Team page with the Field technician role.
          </span>
        )}
      </label>
      {mode === "home" && (
        <label className="sm:col-span-2">
          <span className={label}>Home address *</span>
          <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} className={`${input} resize-y`} />
        </label>
      )}
      <div className="sm:col-span-2">
        <Button
          size="sm"
          disabled={busy || !at || (mode === "home" && !address.trim())}
          onClick={() => onBook({ mode, at: new Date(at).toISOString(), address, technicianUserId })}
        >
          {busy && <PredictSpinner className="size-4" />}
          {order.scheduledAt ? "Update booking" : "Book collection"}
        </Button>
        <span className="ml-2 text-[11px] text-muted-foreground">The patient is told on WhatsApp.</span>
      </div>
    </div>
  )
}

function PaymentForm({ due, busy, onPay }: { due: number; busy: boolean; onPay: (p: Record<string, unknown>) => void }) {
  const [amount, setAmount] = useState(String(due / 100))
  const [method, setMethod] = useState("cash")
  const [reference, setReference] = useState("")
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
      <label>
        <span className={label}>Amount (₹)</span>
        <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
      </label>
      <label>
        <span className={label}>Method</span>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={input}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {method !== "cash" && (
        <label className="col-span-2">
          <span className={label}>Reference (UPI / card ref)</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={input} />
        </label>
      )}
      <Button
        size="sm"
        className="col-span-2"
        disabled={busy || !(Number(amount) > 0)}
        onClick={() => onPay({ amountInRupees: Number(amount), method, reference })}
      >
        {busy && <PredictSpinner className="size-4" />}
        Record payment
      </Button>
    </div>
  )
}

function NoteForm({ value, busy, onSave }: { value: string | null; busy: boolean; onSave: (note: string) => void }) {
  const [note, setNote] = useState(value ?? "")
  return (
    <div className="flex flex-col gap-2">
      <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Fasting, sample issues, call notes…" className={`${input} resize-y`} />
      <Button size="sm" variant="outline" className="self-start" disabled={busy || note === (value ?? "")} onClick={() => onSave(note)}>
        Save note
      </Button>
    </div>
  )
}

function SendToLabForm({ busy, onSend }: { busy: boolean; onSend: (b: { lab: string; expectedOn: string }) => void }) {
  const [lab, setLab] = useState("")
  const [expectedOn, setExpectedOn] = useState("")
  return (
    <div className="grid gap-2 rounded-md border border-dashed border-border p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
      <label>
        <span className={label}>Sent to which lab</span>
        <input value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Name of the outside lab" className={input} />
      </label>
      <label>
        <span className={label}>Report expected</span>
        <input type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} className={input} />
      </label>
      <Button size="sm" disabled={busy || !lab.trim()} onClick={() => onSend({ lab, expectedOn })}>
        {busy && <PredictSpinner className="size-4" />}
        Mark sent to lab
      </Button>
    </div>
  )
}

const EVENT_LABEL: Record<string, string> = {
  booked: "Collection booked",
  on_the_way: "Technician on the way",
  collected: "Sample taken",
  not_collected: "Sample not taken",
  sent_to_lab: "Sent to the lab",
  reported: "Report confirmed — doctor told",
  cancelled: "Cancelled",
}

/** Every step the order took: who, what, when. */
function Timeline({
  createdAt,
  orderedBy,
  events,
}: {
  createdAt: string
  orderedBy: string | null
  events: { kind: string; note: string | null; by: string | null; at: string }[]
}) {
  const rows = [{ kind: "ordered", note: null, by: orderedBy ? `Dr. ${orderedBy}` : null, at: createdAt }, ...events]
  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {rows.map((e, i) => (
        <li key={i} className="relative">
          <span
            className={`absolute -left-[21px] top-1 size-2.5 rounded-full ${
              e.kind === "not_collected" || e.kind === "cancelled" ? "bg-red-500" : i === rows.length - 1 ? "bg-primary" : "bg-muted-foreground/40"
            }`}
          />
          <p className="text-sm font-medium">{e.kind === "ordered" ? "Test prescribed" : (EVENT_LABEL[e.kind] ?? e.kind)}</p>
          {e.note && <p className="text-xs">{e.note}</p>}
          <p className="text-[11px] text-muted-foreground">
            {formatSlot(e.at)}
            {e.by ? ` · ${e.by}` : ""}
          </p>
        </li>
      ))}
    </ol>
  )
}

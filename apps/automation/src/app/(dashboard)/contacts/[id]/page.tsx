"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { use, useCallback, useEffect, useState } from "react"
import { Phone, Mail, MessageCircle } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { leadStatusMeta } from "@workspace/db/lead-status"
import { sideForStage } from "@workspace/db/contact-side"
import { OverviewTab } from "@/src/components/contact-360/overview-tab"
import { MedicalTab } from "@/src/components/contact-360/medical-tab"
import { TherapyTab } from "@/src/components/contact-360/therapy-tab"
import { ChatTab } from "@/src/components/contact-360/chat-tab"
import { JourneyTab } from "@/src/components/contact-360/journey-tab"
import { DocumentsPanel } from "@workspace/ui/components/documents-panel"
import { LeadForms, type LeadForm } from "@/src/components/contact-360/lead-forms"
import { LeadWork } from "@/src/components/contact-360/lead-work"
import { StatusControl } from "@/src/components/contact-360/status-control"

interface Contact {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  stage: string
  engagement: string | null
  source: string | null
  campaign: string | null
  score: number | null
  lastTouchAt: string | null
  leadStatus: string | null
  leadStatusAt: string | null
  callbackAt: string | null
  interest: string | null
  city: string | null
  assignedUserId: string | null
  assignedUserName: string | null
  assignedRole: string | null
}
interface Preferences {
  marketing: boolean
  appointmentReminders: boolean
  medicalReminders: boolean
  transactional: boolean
  whatsappEnabled: boolean
  emailEnabled: boolean
}

const TABS = ["Overview", "Therapy", "Medical", "Chat", "Journey", "Documents"] as const
type Tab = (typeof TABS)[number]

const STAGE_STYLE: Record<string, string> = {
  AUDIENCE: "bg-slate-100 text-slate-600",
  LEAD: "bg-blue-100 text-blue-700",
  BOOKED: "bg-indigo-100 text-indigo-700",
  PATIENT: "bg-green-100 text-green-700",
  INACTIVE: "bg-amber-100 text-amber-700",
  LOST: "bg-muted/5 text-muted-foreground",
}

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [tab, setTab] = useState<Tab>("Overview")
  const [contact, setContact] = useState<Contact | null>(null)
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [leadForms, setLeadForms] = useState<LeadForm[]>([])
  const [canReassign, setCanReassign] = useState(false)
  // Predict (diagnosis only) has no therapy courses, so no Therapy tab there.
  const [hasTherapy, setHasTherapy] = useState(true)
  const [crossClinic, setCrossClinic] = useState(false)
  const [hasAppointments, setHasAppointments] = useState(true)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/contacts/${id}`)
    const d = await res.json().catch(() => null)
    setContact(d?.contact ?? null)
    setPreferences(d?.preferences ?? null)
    setLeadForms(d?.leadForms ?? [])
    setCanReassign(!!d?.canReassign)
    setHasTherapy(!Array.isArray(d?.modules) || d.modules.includes("therapy"))
    setCrossClinic(Boolean(d?.crossClinic))
    setHasAppointments(!Array.isArray(d?.modules) || d.modules.includes("appointments"))
  }, [id])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  if (loading || !contact) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  // A missing preference row means opted in everywhere — see checkConsent()
  // in @workspace/communication. Only ever flag what is actually switched off.
  const optedOut = preferences
    ? (
        [
          ["marketing", preferences.marketing],
          ["appointment reminders", preferences.appointmentReminders],
          ["medical reminders", preferences.medicalReminders],
          ["WhatsApp", preferences.whatsappEnabled],
          ["email", preferences.emailEnabled],
        ] as const
      )
        .filter(([, enabled]) => !enabled)
        .map(([label]) => label)
    : []


  const name = contact.name?.trim() || (contact.phone ? formatPhone(contact.phone) : contact.email) || "Unnamed contact"
  const isLead = sideForStage(contact.stage) === "leads" && contact.stage !== "AUDIENCE"
  const status = isLead ? leadStatusMeta(contact.leadStatus) : undefined
  const details = [
    contact.city,
    [contact.source, contact.campaign].filter(Boolean).join(" · ") || null,
    contact.score !== null ? `score ${contact.score}` : null,
  ].filter(Boolean)

  return (
    <div className="space-y-4">
      {/* Who this is, and the two ways to reach them — on this page the
          phone call is usually the next thing that happens. */}
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="page-title truncate">{name}</h1>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  STAGE_STYLE[contact.stage] ?? "bg-muted text-muted-foreground"
                }`}
              >
                {contact.stage}
              </span>
              {status && (
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${status.tone}`}>{status.label}</span>
              )}
              {contact.engagement === "DO_NOT_CONTACT" && (
                <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                  Do not contact
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {contact.phone && (
                <span className="flex items-center gap-1.5 tabular-nums text-foreground">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatPhone(contact.phone)}
                </span>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 hover:underline">
                  <Mail className="h-3.5 w-3.5" />
                  {contact.email}
                </a>
              )}
            </div>
            {details.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{details.join(" · ")}</p>}
            {optedOut.length > 0 && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Opted out of: {optedOut.join(", ")} — sends in those categories are skipped, not delivered.
              </p>
            )}
          </div>
        </div>

        {contact.phone && (
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button size="sm" nativeButton={false} render={<a href={`tel:+${contact.phone}`} />}>
              <Phone /> Call
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href={`https://wa.me/${contact.phone}`} target="_blank" rel="noreferrer" />}
            >
              <MessageCircle /> WhatsApp
            </Button>
            {!crossClinic && (
              <Button size="sm" variant="outline" onClick={() => setEditing((open) => !open)}>
                {editing ? "Close" : "Edit"}
              </Button>
            )}
          </div>
        )}
        {!contact.phone && !crossClinic && (
          <Button size="sm" variant="outline" onClick={() => setEditing((open) => !open)}>
            {editing ? "Close" : "Edit"}
          </Button>
        )}
      </section>

      {editing && !crossClinic && (
        <ContactDetailsForm
          contactId={id}
          name={contact.name ?? ""}
          phone={contact.phone ?? ""}
          email={contact.email ?? ""}
          city={contact.city ?? ""}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            load()
          }}
        />
      )}

      {/* Tabs on the left; what a caller acts on stays on the right whichever
          tab is open. Stacks under the header on a phone, work panel first. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <aside className="space-y-4 lg:order-2 lg:sticky lg:top-0">
          {isLead && !crossClinic && (
            <LeadWork
              contactId={id}
              leadStatus={contact.leadStatus}
              leadStatusAt={contact.leadStatusAt}
              callbackAt={contact.callbackAt}
              interest={contact.interest}
              city={contact.city}
              assignedUserId={contact.assignedUserId}
              assignedUserName={contact.assignedUserName}
              assignedRole={contact.assignedRole}
              canReassign={canReassign}
              onChanged={load}
            />
          )}
          {!crossClinic && (
            <StatusControl contactId={id} stage={contact.stage} engagement={contact.engagement} onChanged={load} />
          )}
          <LeadForms forms={leadForms} />
        </aside>

        <div className="min-w-0 space-y-4 lg:order-1">
          <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border pb-2">
            {TABS.filter((t) => (t !== "Therapy" || hasTherapy) && (!crossClinic || t === "Overview" || t === "Medical")).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={tab === t ? "default" : "ghost"}
                onClick={() => setTab(t)}
                className="shrink-0"
              >
                {t}
              </Button>
            ))}
          </div>

          {tab === "Overview" && <OverviewTab contactId={id} appointments={hasAppointments} />}
          {/* onChanged: the first course moves them to PATIENT, and the stage
              chip in the header above has to follow. */}
          {tab === "Therapy" && hasTherapy && <TherapyTab contactId={id} onChanged={load} />}
          {tab === "Medical" && <MedicalTab contactId={id} />}
          {tab === "Chat" && <ChatTab contactId={id} contactName={contact.name} />}
          {tab === "Journey" && <JourneyTab contactId={id} />}
          {tab === "Documents" && (
            <section className="rounded-md border border-border p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Documents</h2>
              <DocumentsPanel url={`/api/contacts/${id}/documents`} />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

/** 918530355551 → +91 85303 55551. */
function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "")
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`
  return `+${d}`
}

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return name.replace(/\D/g, "").slice(-2) || "#"
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase()
}

const INPUT = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"

function ContactDetailsForm({
  contactId,
  name,
  phone,
  email,
  city,
  onSaved,
  onCancel,
}: {
  contactId: string
  name: string
  phone: string
  email: string
  city: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [values, setValues] = useState({
    name,
    phone,
    email,
    city,
    dateOfBirth: "",
    gender: "",
    bloodGroup: "",
  })
  const [hasChart, setHasChart] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/contacts/${contactId}/medical`)
      .then((res) => res.json())
      .then((data) => {
        const chart = data?.chart
        if (!chart) return
        setHasChart(true)
        setValues((current) => ({
          ...current,
          dateOfBirth: typeof chart.dateOfBirth === "string" && !chart.dateOfBirth.startsWith("1900-") ? chart.dateOfBirth.slice(0, 10) : "",
          gender: ["MALE", "FEMALE", "OTHER"].includes(chart.gender) ? chart.gender : "",
          bloodGroup: chart.bloodGroup ?? "",
        }))
      })
      .catch(() => {})
  }, [contactId])

  async function save() {
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/contacts/${contactId}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          phone: values.phone,
          email: values.email,
          city: values.city,
          ...(hasChart
            ? { dateOfBirth: values.dateOfBirth, gender: values.gender, bloodGroup: values.bloodGroup }
            : {}),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "Could not save these details")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save these details")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs text-muted-foreground">Full name</span>
        <input className={INPUT} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted-foreground">Mobile</span>
        <input className={INPUT} value={values.phone} inputMode="tel" onChange={(e) => setValues({ ...values, phone: e.target.value })} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted-foreground">Email</span>
        <input className={INPUT} value={values.email} inputMode="email" onChange={(e) => setValues({ ...values, email: e.target.value })} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted-foreground">City</span>
        <input className={INPUT} value={values.city} onChange={(e) => setValues({ ...values, city: e.target.value })} />
      </label>
      {hasChart && (
        <>
          <label>
            <span className="mb-1 block text-xs text-muted-foreground">Date of birth</span>
            <input className={INPUT} type="date" value={values.dateOfBirth} onChange={(e) => setValues({ ...values, dateOfBirth: e.target.value })} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted-foreground">Sex</span>
            <select className={INPUT} value={values.gender} onChange={(e) => setValues({ ...values, gender: e.target.value })}>
              <option value="">Select…</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted-foreground">Blood group</span>
            <select className={INPUT} value={values.bloodGroup} onChange={(e) => setValues({ ...values, bloodGroup: e.target.value })}>
              <option value="">—</option>
              {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="button" size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </section>
  )
}

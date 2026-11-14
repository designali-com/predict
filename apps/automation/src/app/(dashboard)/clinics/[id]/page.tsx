"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Building2,
  Check,
  Copy,
  MapPin,
  MessageCircle,
  Plus,
  Route,
  Settings2,
  Trash2,
  TriangleAlert,
  UserPlus,
  UsersRound,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { toast } from "@workspace/ui/components/sonner"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"
import { ClinicTeam } from "@workspace/ui/components/clinic-team"
import { CLINIC_MODULES } from "@workspace/db/clinic-modules"

interface Clinic {
  id: string
  name: string
  slug: string
  city: string | null
  state: string | null
  addressLine1: string | null
  addressLine2: string | null
  pincode: string | null
  phone: string | null
  email: string | null
  gstin: string | null
  registrationNo: string | null
  footerNote: string | null
  timezone: string
  isActive: boolean
  createdAt: string
  shortName: string | null
  legalName: string | null
  website: string | null
  logoUrl: string | null
  logoDarkUrl: string | null
  iconUrl: string | null
  brandColor: string | null
  receiptPrefix: string
  modules: string[]
}

interface Settings {
  quietHoursEnabled: boolean
  quietStartHour: number
  quietEndHour: number
  timezone: string
  firstResponseMinutes: number
  callbackReminders: boolean
}

interface LeadRule {
  id: string
  kind: string
  name: string
  active: boolean
  hubLabel: string | null
  assignRole: string | null
}

interface ChannelRow {
  id: string
  phoneNumberId: string
  wabaId: string | null
  displayNumber: string | null
  tokenEnvVar: string | null
  isDefault: boolean
  isActive: boolean
  tokenPresent: boolean
}

const TABS = [
  { key: "overview", label: "Overview", icon: Building2 },
  { key: "team", label: "Team & roles", icon: UsersRound },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "settings", label: "Settings", icon: Settings2 },
] as const
type Tab = (typeof TABS)[number]["key"]

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:border-ring focus:outline-none disabled:opacity-60"
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground"

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? "am" : "pm"}`

/**
 * One clinic: its details, its team and the role each person holds here,
 * its WhatsApp number and its house rules. Everything on this page belongs
 * to this clinic only.
 */
export default function ClinicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const search = useSearchParams()
  const initialTab = (TABS.find((t) => t.key === search.get("tab"))?.key ?? "overview") as Tab
  const [tab, setTab] = useState<Tab>(initialTab)

  const [clinic, setClinic] = useState<Clinic | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [leadRules, setLeadRules] = useState<LeadRule[]>([])
  const [places, setPlaces] = useState<string[]>([])
  const [timezones, setTimezones] = useState<string[]>([])
  const [canOpenClose, setCanOpenClose] = useState(false)
  const [isActiveClinic, setIsActiveClinic] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/clinics/${id}`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return setNotFound(d.error ?? "Could not load this clinic")
    setClinic(d.clinic)
    setSettings(d.settings)
    setLeadRules(d.leadRules ?? [])
    setPlaces(d.places ?? [])
    setTimezones(d.timezones ?? [])
    setCanOpenClose(!!d.canOpenClose)
    setIsActiveClinic(!!d.isActiveClinic)
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  function pickTab(next: Tab) {
    setTab(next)
    router.replace(`/clinics/${id}?tab=${next}`, { scroll: false })
  }

  async function switchHere() {
    const res = await fetch("/api/clinics/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicId: id }),
    })
    if (res.ok) {
      toast.success("Switched clinic")
      window.location.href = "/home"
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? "Couldn't switch clinic")
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }
  if (notFound || !clinic || !settings) {
    return (
      <div className="space-y-3">
        <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {notFound ?? "Could not load this clinic."}
        </p>
        <Link href="/clinics" className="text-sm underline">
          All clinics
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={clinic.name}
        actions={
          !isActiveClinic &&
          clinic.isActive && (
            <Button type="button" size="sm" variant="outline" onClick={switchHere}>
              Switch to this clinic
            </Button>
          )
        }
      >
        {(!clinic.isActive || isActiveClinic) && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {!clinic.isActive && <span className="rounded bg-muted px-1.5 py-0.5 text-xs">closed</span>}
            {isActiveClinic && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                you are here
              </span>
            )}
          </div>
        )}
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {[clinic.addressLine1, clinic.city, clinic.state, clinic.pincode].filter(Boolean).join(", ") || "No address yet"}
        </p>
      </PageHeader>

      <div className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
        {TABS.map((t) => (
          <Button
            key={t.key}
            type="button"
            onClick={() => pickTab(t.key)} variant="outline" className="-mb-px">
            <t.icon className="h-4 w-4" />
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab
          clinic={clinic}
          places={places}
          timezones={timezones}
          canOpenClose={canOpenClose}
          isActiveClinic={isActiveClinic}
          onSaved={(c) => setClinic(c)}
        />
      )}
      {tab === "team" && <ClinicTeam apiBase={`/api/clinics/${id}/staff`} />}
      {tab === "whatsapp" && <WhatsAppTab clinicId={id} />}
      {tab === "settings" && (
        <SettingsTab clinicId={id} settings={settings} timezones={timezones} leadRules={leadRules} onSaved={setSettings} />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- overview */

function OverviewTab({
  clinic,
  places,
  timezones,
  canOpenClose,
  isActiveClinic,
  onSaved,
}: {
  clinic: Clinic
  places: string[]
  timezones: string[]
  canOpenClose: boolean
  isActiveClinic: boolean
  onSaved: (c: Clinic) => void
}) {
  const pick = (c: Clinic) => ({
    name: c.name ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    addressLine1: c.addressLine1 ?? "",
    addressLine2: c.addressLine2 ?? "",
    pincode: c.pincode ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    gstin: c.gstin ?? "",
    registrationNo: c.registrationNo ?? "",
    footerNote: c.footerNote ?? "",
    timezone: c.timezone ?? "Asia/Kolkata",
  })
  const [draft, setDraft] = useState(pick(clinic))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(clinic))

  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }))

  async function save(details: Record<string, unknown>) {
    setBusy(true)
    setMessage(null)
    const res = await fetch(`/api/clinics/${clinic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ details }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      toast.error(d.error ?? "Could not save")
      return setMessage({ ok: false, text: d.error ?? "Could not save" })
    }
    onSaved(d.clinic)
    setDraft(pick(d.clinic))
    setMessage({ ok: true, text: "Saved." })
    if ("isActive" in details) toast.success(details.isActive ? "Clinic reopened" : "Clinic closed")
    else toast.success("Clinic details saved")
  }

  const cityOptions = draft.city && !places.includes(draft.city) ? [draft.city, ...places] : places

  return (
    <div className="space-y-5">
      <BrandingSection clinic={clinic} onSaved={onSaved} />
      <ModulesSection clinic={clinic} onSaved={onSaved} canEdit={canOpenClose} />

      <section className="space-y-3 rounded-md border border-border p-4">
        <h2 className="text-sm font-medium">Details</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className={labelClass}>Name</label>
            <input value={draft.name} onChange={set("name")} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>City</label>
            <select value={draft.city} onChange={set("city")} className={inputClass}>
              <option value="">Choose…</option>
              {cityOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>State</label>
            <input value={draft.state} onChange={set("state")} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Address</label>
            <input value={draft.addressLine1} onChange={set("addressLine1")} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Address line 2</label>
            <input value={draft.addressLine2} onChange={set("addressLine2")} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>PIN code</label>
            <input value={draft.pincode} onChange={set("pincode")} inputMode="numeric" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input value={draft.phone} onChange={set("phone")} inputMode="tel" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input value={draft.email} onChange={set("email")} inputMode="email" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>GSTIN</label>
            <input value={draft.gstin} onChange={set("gstin")} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Registration no.</label>
            <input value={draft.registrationNo} onChange={set("registrationNo")} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Timezone</label>
            <select value={draft.timezone} onChange={set("timezone")} className={inputClass}>
              {timezones.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelClass}>Receipt footer note</label>
            <textarea value={draft.footerNote} onChange={set("footerNote")} rows={2} className={inputClass} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {message && <span className={`text-xs ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</span>}
          <Button type="button" disabled={!dirty || busy} onClick={() => save(draft)}>
            {busy && <PredictSpinner className="size-4" />}
            Save details
          </Button>
        </div>
      </section>

      {canOpenClose && (
        <section className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium">{clinic.isActive ? "Close this clinic" : "Reopen this clinic"}</h2>
            <p className="text-xs text-muted-foreground">
              {clinic.isActive
                ? "A closed clinic keeps all its records but disappears from the clinic switcher. Nothing is deleted."
                : "Its team gets it back in their clinic switcher, with everything as it was."}
            </p>
          </div>
          <Button
            type="button"
            disabled={busy || (clinic.isActive && isActiveClinic)}
            title={clinic.isActive && isActiveClinic ? "Switch to another clinic first" : undefined}
            onClick={() => {
              if (clinic.isActive && !confirm(`Close ${clinic.name}? Its records stay; it just stops appearing.`)) return
              save({ isActive: !clinic.isActive })
            }} variant={clinic.isActive ? "destructive" : "outline"}>
            {clinic.isActive ? "Close clinic" : "Reopen clinic"}
          </Button>
        </section>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- branding */

const IMAGE_SLOTS = [
  { kind: "logo", label: "Logo", hint: "Heads the sidebar and the receipts", column: "logoUrl" },
  { kind: "logoDark", label: "Logo on dark", hint: "Optional — for the dark theme", column: "logoDarkUrl" },
  { kind: "icon", label: "Tab icon", hint: "Square, shown in the browser tab", column: "iconUrl" },
] as const

/**
 * How the clinic looks to its own staff and patients: the name in the tab, the
 * logo on the sidebar and receipts, its colour, and how its receipts are numbered.
 */
function BrandingSection({ clinic, onSaved }: { clinic: Clinic; onSaved: (c: Clinic) => void }) {
  const pick = (c: Clinic) => ({
    shortName: c.shortName ?? "",
    legalName: c.legalName ?? "",
    website: c.website ?? "",
    brandColor: c.brandColor ?? "",
    receiptPrefix: c.receiptPrefix ?? "",
  })
  const [draft, setDraft] = useState(pick(clinic))
  const [busy, setBusy] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(clinic))
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }))

  async function save() {
    setBusy("save")
    const res = await fetch(`/api/clinics/${clinic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ details: draft }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) return toast.error(d.error ?? "Could not save")
    onSaved(d.clinic)
    setDraft(pick(d.clinic))
    toast.success("Branding saved")
  }

  async function upload(kind: string, file: File) {
    setBusy(kind)
    const form = new FormData()
    form.set("kind", kind)
    form.set("file", file)
    const res = await fetch(`/api/clinics/${clinic.id}/branding`, { method: "POST", body: form })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) return toast.error(d.error ?? "Could not upload")
    onSaved(d.clinic)
    toast.success("Image saved")
  }

  async function remove(kind: string) {
    setBusy(kind)
    const res = await fetch(`/api/clinics/${clinic.id}/branding?kind=${kind}`, { method: "DELETE" })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) return toast.error(d.error ?? "Could not remove")
    onSaved(d.clinic)
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <h2 className="text-sm font-medium">Branding</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {IMAGE_SLOTS.map((slot) => {
          const url = clinic[slot.column]
          return (
            <div key={slot.kind} className="rounded-md border border-border p-3">
              <p className="text-xs font-medium">{slot.label}</p>
              <p className="text-[11px] text-muted-foreground">{slot.hint}</p>
              <div className={`mt-2 flex h-16 items-center justify-center rounded ${slot.kind === "logoDark" ? "bg-black" : "bg-muted/40"}`}>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="max-h-14 max-w-full object-contain" />
                ) : (
                  <span className="text-[11px] text-muted-foreground">None</span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
                  {busy === slot.kind ? "Uploading…" : url ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    disabled={busy !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ""
                      if (file) void upload(slot.kind, file)
                    }}
                  />
                </label>
                {url && (
                  <button type="button" className="text-xs text-muted-foreground hover:text-red-600" disabled={busy !== null} onClick={() => remove(slot.kind)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={labelClass}>Short name</label>
          <input value={draft.shortName} onChange={set("shortName")} placeholder={clinic.name} className={inputClass} />
          <p className="mt-1 text-[11px] text-muted-foreground">In the browser tab and the sidebar when there is no logo</p>
        </div>
        <div>
          <label className={labelClass}>Receipt prefix</label>
          <input value={draft.receiptPrefix} onChange={set("receiptPrefix")} placeholder="OPTM" className={`${inputClass} uppercase`} />
          <p className="mt-1 text-[11px] text-muted-foreground">{(draft.receiptPrefix || "RCPT").toUpperCase()}/26-27/00001</p>
        </div>
        <div>
          <label className={labelClass}>Brand colour</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(draft.brandColor) ? draft.brandColor : "#4f46e5"}
              onChange={set("brandColor")}
              className="h-9 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
            />
            <input value={draft.brandColor} onChange={set("brandColor")} placeholder="Panel default" className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Legal name</label>
          <input value={draft.legalName} onChange={set("legalName")} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Website</label>
          <input value={draft.website} onChange={set("website")} inputMode="url" className={inputClass} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="button" disabled={!dirty || busy !== null} onClick={save}>
          {busy === "save" && <PredictSpinner className="size-4" />}
          Save branding
        </Button>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- modules */

/**
 * What the clinic uses of the panel. A module switched off takes its pages
 * out of the sidebar and closes them and their APIs, whatever a role holds.
 * Superadmin only, like opening a clinic: it is what the clinic has bought.
 */
function ModulesSection({ clinic, onSaved, canEdit }: { clinic: Clinic; onSaved: (c: Clinic) => void; canEdit: boolean }) {
  const [draft, setDraft] = useState<string[]>(clinic.modules ?? [])
  const [busy, setBusy] = useState(false)
  const dirty = [...draft].sort().join() !== [...(clinic.modules ?? [])].sort().join()
  const toggle = (key: string) => setDraft((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]))

  async function save() {
    setBusy(true)
    const res = await fetch(`/api/clinics/${clinic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ details: { modules: draft } }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return toast.error(d.error ?? "Could not save")
    onSaved(d.clinic)
    setDraft(d.clinic.modules ?? [])
    toast.success("Modules saved")
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <div>
        <h2 className="text-sm font-medium">Modules</h2>
        <p className="text-[11px] text-muted-foreground">
          Patients, the dashboard, settings, the team and roles come with every clinic.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CLINIC_MODULES.map((m) => (
          <label
            key={m.key}
            className={`flex items-start gap-2 rounded-md border border-border p-3 ${canEdit ? "cursor-pointer" : "opacity-70"}`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={draft.includes(m.key)}
              disabled={!canEdit || busy}
              onChange={() => toggle(m.key)}
            />
            <span>
              <span className="block text-xs font-medium">{m.label}</span>
              <span className="block text-[11px] text-muted-foreground">{m.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="button" disabled={!dirty || busy} onClick={save}>
            {busy && <PredictSpinner className="size-4" />}
            Save modules
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Only a superadmin can change a clinic's modules.</p>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- whatsapp */

function WhatsAppTab({ clinicId }: { clinicId: string }) {
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [envDefault, setEnvDefault] = useState<{ phoneNumberId: string | null; wabaId: string | null }>({
    phoneNumberId: null,
    wabaId: null,
  })
  const empty = { phoneNumberId: "", wabaId: "", displayNumber: "", tokenEnvVar: "", isDefault: false }
  const [draft, setDraft] = useState(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await fetch(`/api/clinics/${clinicId}/channels`).then((r) => r.json())
    setChannels(d.channels ?? [])
    setEnvDefault(d.envDefault ?? { phoneNumberId: null, wabaId: null })
  }, [clinicId])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  async function save() {
    setError(null)
    const res = await fetch(`/api/clinics/${clinicId}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(d.error ?? "Could not save the number")
      return setError(d.error ?? "Could not save the number")
    }
    toast.success("WhatsApp number saved")
    setDraft(empty)
    load()
  }

  async function remove(channelId: string) {
    if (!confirm("Remove this number from the clinic?")) return
    const res = await fetch(`/api/clinics/${clinicId}/channels?channelId=${channelId}`, { method: "DELETE" })
    if (res.ok) toast.success("Number removed")
    else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? "Couldn't remove the number")
    }
    load()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <PredictSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        The number this clinic sends from — and the one that tells us an incoming message belongs here. With no number
        of its own, the clinic uses the group default. Tokens are never stored: name the environment variable that
        holds one.
      </p>

      {channels.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No number of its own — messages go out from the group default.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {channels.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
              <span className="font-medium">{c.displayNumber ?? c.phoneNumberId}</span>
              {c.isDefault && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                  group default
                </span>
              )}
              {!c.isActive && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">paused</span>}
              <span className="text-[11px] text-muted-foreground">
                id {c.phoneNumberId}
                {c.wabaId ? ` · WABA ${c.wabaId}` : ""}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  c.tokenPresent ? "bg-muted text-muted-foreground" : "bg-red-500/15 text-red-600"
                }`}
              >
                {c.tokenPresent
                  ? `token: ${c.tokenEnvVar ?? "WHATSAPP_ACCESS_TOKEN"}`
                  : `${c.tokenEnvVar ?? "WHATSAPP_ACCESS_TOKEN"} missing on the server`}
              </span>
              <Button
                type="button"
                onClick={() => remove(c.id)}

                aria-label="Remove number" variant="destructive" className="ml-auto">
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3 rounded-md border border-border p-4">
        <h2 className="text-sm font-medium">Add a number</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Phone number id *</label>
            <input
              value={draft.phoneNumberId}
              onChange={(e) => setDraft({ ...draft, phoneNumberId: e.target.value })}
              placeholder={envDefault.phoneNumberId ? `env: ${envDefault.phoneNumberId}` : ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Number shown to people</label>
            <input
              value={draft.displayNumber}
              onChange={(e) => setDraft({ ...draft, displayNumber: e.target.value })}
              placeholder="+91 …"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>WABA id</label>
            <input
              value={draft.wabaId}
              onChange={(e) => setDraft({ ...draft, wabaId: e.target.value })}
              placeholder={envDefault.wabaId ? `env: ${envDefault.wabaId}` : ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Token environment variable</label>
            <input
              value={draft.tokenEnvVar}
              onChange={(e) => setDraft({ ...draft, tokenEnvVar: e.target.value })}
              placeholder="blank = WHATSAPP_ACCESS_TOKEN"
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
            />
            Group default (clinics without their own number use this)
          </label>
          <Button type="button" onClick={save} disabled={!draft.phoneNumberId.trim()}>
            Save number
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </section>
    </div>
  )
}

/* ---------------------------------------------------------------- settings */

function SettingsTab({
  clinicId,
  settings,
  timezones,
  leadRules,
  onSaved,
}: {
  clinicId: string
  settings: Settings
  timezones: string[]
  leadRules: LeadRule[]
  onSaved: (s: Settings) => void
}) {
  const [draft, setDraft] = useState(settings)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

  async function save() {
    setBusy(true)
    setMessage(null)
    const res = await fetch(`/api/clinics/${clinicId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: draft }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      toast.error(d.error ?? "Could not save")
      return setMessage({ ok: false, text: d.error ?? "Could not save" })
    }
    onSaved(d.settings)
    setDraft(d.settings)
    setMessage({ ok: true, text: "Saved." })
    toast.success("Clinic settings saved")
  }

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-md border border-border p-4">
        <h2 className="text-sm font-medium">Automated messages</h2>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.quietHoursEnabled}
            onChange={(e) => setDraft({ ...draft, quietHoursEnabled: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            Hold automated messages at night
            <span className="block text-xs text-muted-foreground">
              A message due during quiet hours goes out when the window opens — it is never skipped.
            </span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Quiet from</label>
            <select
              value={draft.quietStartHour}
              onChange={(e) => setDraft({ ...draft, quietStartHour: Number(e.target.value) })}
              className={inputClass}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Until</label>
            <select
              value={draft.quietEndHour}
              onChange={(e) => setDraft({ ...draft, quietEndHour: Number(e.target.value) })}
              className={inputClass}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Clock</label>
            <select
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
              className={inputClass}
            >
              {timezones.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-md border border-border p-4">
        <h2 className="text-sm font-medium">Lead desk</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>A new lead is overdue after (minutes)</label>
            <input
              type="number"
              min={5}
              max={1440}
              value={draft.firstResponseMinutes}
              onChange={(e) => setDraft({ ...draft, firstResponseMinutes: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
          <label className="flex items-start gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={draft.callbackReminders}
              onChange={(e) => setDraft({ ...draft, callbackReminders: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              Callback reminders
              <span className="block text-xs text-muted-foreground">Put a promised callback back on the call queue when it is due.</span>
            </span>
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {message && <span className={`text-xs ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</span>}
        <Button type="button" disabled={!dirty || busy} onClick={save}>
          {busy && <PredictSpinner className="size-4" />}
          Save settings
        </Button>
      </div>

      <section className="space-y-3 rounded-md border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Route className="h-4 w-4 text-muted-foreground" /> Leads routed here
          </h2>
          <Link href="/lead-routing" className="text-xs underline">
            Edit in Lead routing
          </Link>
        </div>
        {leadRules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No routing rule sends leads to this clinic yet — add one in Lead routing so nearby leads land here.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {leadRules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{r.kind}</span>
                {r.hubLabel && <span className="text-xs text-muted-foreground">near {r.hubLabel}</span>}
                {r.assignRole && <span className="text-xs text-muted-foreground">→ {r.assignRole}</span>}
                {!r.active && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">off</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

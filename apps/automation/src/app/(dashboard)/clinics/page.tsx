"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, ChevronRight, MapPin, MessageCircle, Plus, Search } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

interface ClinicCard {
  id: string
  name: string
  slug: string
  city: string | null
  state: string | null
  phone: string | null
  isActive: boolean
  kind?: string
  role: string | null
  staff: number
  leads: number
  patients: number
  upcoming: number
  whatsapp: string[]
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:border-ring focus:outline-none"
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground"

/**
 * Clinics — one row per clinic, searchable. Opening a row goes to that clinic's own
 * page: its details, its team and their roles, its WhatsApp number and its
 * settings. A superadmin sees every clinic and can open a new one.
 */
export default function ClinicsPage() {
  const [clinics, setClinics] = useState<ClinicCard[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [canCreate, setCanCreate] = useState(false)
  const [places, setPlaces] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState("")

  const load = useCallback(async () => {
    const d = await fetch("/api/clinics/overview").then((r) => r.json())
    setClinics(d.clinics ?? [])
    setActiveId(d.activeId ?? null)
    setCanCreate(!!d.canCreate)
    setPlaces(d.places ?? [])
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const shown = clinics.filter(
    (c) =>
      !q ||
      [c.name, c.city, c.state, c.phone, c.slug, ...c.whatsapp].some((v) => (v ?? "").toLowerCase().includes(q)),
  )
  // Open clinics first, closed ones after; the one you are in at the top.
  shown.sort((a, b) => Number(b.isActive) - Number(a.isActive) || Number(b.id === activeId) - Number(a.id === activeId) || a.name.localeCompare(b.name))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clinics"
        description="Each clinic keeps its own team, leads, appointments and money. Open one to see its details, its people and their roles, and its settings."
        actions={
          canCreate && (
            <Button type="button" size="sm" onClick={() => setCreating(true)}>
              <Plus /> New clinic
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, city or number"
            className={`${inputClass} pl-8`}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {shown.length} of {clinics.length} clinic{clinics.length === 1 ? "" : "s"}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {clinics.length === 0 ? "No clinics yet." : "No clinic matches that search."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          {/* Column heads, from md up; on a phone each row stacks. */}
          <div className="hidden grid-cols-[minmax(0,2fr)_repeat(4,5rem)_minmax(0,1.3fr)_1.5rem] items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
            <span>Clinic</span>
            <span className="text-right">Staff</span>
            <span className="text-right">Leads</span>
            <span className="text-right">Patients</span>
            <span className="text-right">Upcoming</span>
            <span>WhatsApp</span>
            <span />
          </div>
          <ul className="divide-y divide-border">
            {shown.map((c) => (
              <li key={c.id}>
                <ClinicRow clinic={c} here={c.id === activeId} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <NewClinicDialog open={creating} onOpenChange={setCreating} places={places} />
    </div>
  )
}

function ClinicRow({ clinic: c, here }: { clinic: ClinicCard; here: boolean }) {
  const stats = [
    { label: "Staff", value: c.staff },
    { label: "Leads", value: c.leads },
    { label: "Patients", value: c.patients },
    { label: "Upcoming", value: c.upcoming },
  ]
  return (
    <Link
      href={`/clinics/${c.id}`}
      className={`group grid gap-2 px-4 py-3 transition hover:bg-muted/40 md:grid-cols-[minmax(0,2fr)_repeat(4,5rem)_minmax(0,1.3fr)_1.5rem] md:items-center md:gap-3 ${
        c.isActive ? "" : "opacity-60"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{c.name}</span>
          {here && (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              you are here
            </span>
          )}
          {c.kind === "partner" && (
            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">partner</span>
          )}
          {!c.isActive && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">closed</span>}
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{[c.city, c.state].filter(Boolean).join(", ") || "No city set"}</span>
        </p>
      </div>
      {stats.map((s) => (
        <div key={s.label} className="hidden text-right text-sm tabular-nums md:block">
          {s.value}
        </div>
      ))}
      {/* On a phone the numbers sit under the name as one line. */}
      <p className="text-xs text-muted-foreground md:hidden">
        {stats.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(" · ")}
      </p>
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <MessageCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{c.whatsapp.length ? c.whatsapp.join(", ") : "Default number"}</span>
      </p>
      <ChevronRight className="hidden h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 md:block" />
    </Link>
  )
}

function NewClinicDialog({
  open,
  onOpenChange,
  places,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  places: string[]
}) {
  const router = useRouter()
  const empty = { name: "", shortName: "", receiptPrefix: "", kind: "clinic", city: "", state: "", addressLine1: "", pincode: "", phone: "", email: "", gstin: "" }
  const [draft, setDraft] = useState(empty)
  const [logo, setLogo] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }))

  async function create() {
    setBusy(true)
    setError(null)
    const res = await fetch("/api/clinics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      toast.error(d.error ?? "Could not open the clinic")
      return setError(d.error ?? "Could not open the clinic")
    }
    // The logo goes up once the clinic exists; a failed upload leaves the
    // clinic open, with the logo to add from its page.
    if (logo) {
      const form = new FormData()
      form.set("kind", "logo")
      form.set("file", logo)
      const up = await fetch(`/api/clinics/${d.clinic.id}/branding`, { method: "POST", body: form })
      if (!up.ok) toast.error((await up.json().catch(() => ({}))).error ?? "The logo did not upload — add it from the clinic page")
    }
    toast.success("Clinic created")
    setDraft(empty)
    setLogo(null)
    onOpenChange(false)
    // Straight into it: the next thing to do is add its team.
    router.push(`/clinics/${d.clinic.id}?tab=team`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New clinic</DialogTitle>
          <DialogDescription>
            After opening it you&apos;ll add its team — admin, doctors and the rest — on the next screen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Name *</label>
            <input value={draft.name} onChange={set("name")} placeholder="e.g. OPTM Health Care" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Short name</label>
            <input value={draft.shortName} onChange={set("shortName")} placeholder="e.g. OPTM" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Receipt prefix *</label>
            <input value={draft.receiptPrefix} onChange={set("receiptPrefix")} placeholder="e.g. OPTM" className={`${inputClass} uppercase`} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Logo</label>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} className={inputClass} />
            <p className="mt-1 text-[11px] text-muted-foreground">Heads the clinic panel and its receipts. PNG, JPG, WebP or SVG, under 2 MB.</p>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Kind</label>
            <select value={draft.kind} onChange={set("kind")} className={inputClass}>
              <option value="clinic">Our clinic</option>
              <option value="partner">Partner hospital (e.g. Apollo)</option>
            </select>
            {draft.kind === "partner" && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Its doctors see only the patients this hospital registers, and it takes no leads. Add its doctors with
                the Partner doctor role.
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>City *</label>
            <select value={draft.city} onChange={set("city")} className={inputClass}>
              <option value="">Choose…</option>
              {places.map((p) => (
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
        </div>
        <p className="text-[11px] text-muted-foreground">
          The city comes from a list because it decides which clinic a far-away lead is routed to.
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={create}
            disabled={busy || !draft.name.trim() || !draft.city}>
            {busy && <PredictSpinner className="size-4" />}
            Open clinic
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

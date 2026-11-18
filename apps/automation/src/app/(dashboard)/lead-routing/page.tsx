"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import {
  ArrowRight,
  Clapperboard,
  FlaskConical,
  MapPin,
  Pencil,
  Plus,
  Target,
  Trash2,
  Users,
} from "lucide-react"
import { MATCH_FIELDS } from "@workspace/db/lead-rule-fields"
import Link from "next/link"
import { CLINIC_PLACES } from "@workspace/db/india-geo"
import { toast } from "@workspace/ui/components/sonner"
import { PageHeader } from "@workspace/ui/components/page-header"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"

type Kind = "assign" | "interest"

interface Rule {
  id: string
  kind: Kind
  name: string
  priority: number
  active: boolean
  matchField: string
  matchValues: string
  assignRole: string | null
  assignUserIds: string[]
  interest: string | null
  hubLabel: string | null
  clinicId: string | null
  /** False for another clinic's rule: visible so the map makes sense, not editable. */
  editable?: boolean
}

interface Person {
  id: string
  name: string
  role: string | null
  clinicIds?: string[]
}

interface AdRow {
  provider: string
  campaignName: string | null
  adsetName: string | null
  adName: string | null
  adId: string | null
  formName: string | null
  leads: number
  lastAt: string
  icp: string | null
  icpName: string | null
}

type Draft = Omit<Rule, "id"> & { id?: string }

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground"
const hintClass = "mt-1 text-[11px] text-muted-foreground"

const EMPTY: Record<Kind, Draft> = {
  assign: {
    kind: "assign",
    name: "",
    priority: 100,
    active: true,
    matchField: "city",
    matchValues: "",
    assignRole: null,
    assignUserIds: [],
    interest: null,
    hubLabel: null,
    clinicId: null,
  },
  interest: {
    kind: "interest",
    name: "",
    priority: 100,
    active: true,
    matchField: "any",
    matchValues: "",
    assignRole: null,
    assignUserIds: [],
    interest: "",
    hubLabel: null,
    clinicId: null,
  },
}

const fieldLabel = (key: string) => MATCH_FIELDS.find((f) => f.key === key)?.label ?? key
const codeOf = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
const words = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean)

/**
 * Lead routing: for every new lead, which clinic and which person gets it, and
 * which ICP (audience) the ad was for. Three steps, top to bottom, with a
 * tester beside them that runs a made-up lead through the live rules.
 */
export default function LeadRoutingPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [roles, setRoles] = useState<{ key: string; label: string }[]>([])
  const [ads, setAds] = useState<AdRow[]>([])
  const [testing, setTesting] = useState(false)
  const [clinics, setClinics] = useState<{ id: string; name: string }[]>([])
  const [activeClinicId, setActiveClinicId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [r, s, a] = await Promise.all([
      fetch("/api/lead-rules").then((x) => x.json()),
      fetch("/api/staff/assignable").then((x) => x.json()),
      fetch("/api/lead-rules/ads").then((x) => x.json()),
    ])
    setRules(r.rules ?? [])
    setClinics(r.clinics ?? [])
    setActiveClinicId(r.activeClinicId ?? null)
    setPeople(s.people ?? [])
    setRoles(s.roles ?? [])
    setAds(a.ads ?? [])
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  async function put(rule: Draft) {
    const res = await fetch(rule.id ? `/api/lead-rules/${rule.id}` : "/api/lead-rules", {
      method: rule.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error ?? "Could not save")
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      await put(draft)
      toast.success("Rule saved")
      setDraft(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save")
      toast.error(e instanceof Error ? e.message : "Could not save")
    } finally {
      setSaving(false)
    }
  }

  async function remove(rule: Rule) {
    if (!confirm(`Delete "${rule.name}"?`)) return
    const res = await fetch(`/api/lead-rules/${rule.id}`, { method: "DELETE" })
    if (res.ok) toast.success("Rule deleted")
    else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? "Couldn't delete the rule")
    }
    load()
  }

  async function toggle(rule: Rule) {
    try {
      await put({ ...rule, active: !rule.active })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save")
      return
    }
    toast.success(rule.active ? "Rule paused" : "Rule resumed")
    load()
  }

  /** Map one ad to an ICP by adding its ad id (or name) to that ICP's keywords. */
  async function mapAd(ad: AdRow, icpCode: string) {
    const rule = rules.find((r) => r.kind === "interest" && r.interest === icpCode)
    const key = ad.adId ?? ad.adName
    if (!rule || !key) return
    const matchValues = [rule.matchValues, key].filter(Boolean).join(", ")
    // Ad ids live in the "ad" haystack, so widen a narrower match field.
    const matchField = ["any", "ad"].includes(rule.matchField) ? rule.matchField : "any"
    try {
      await put({ ...rule, matchValues, matchField })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save")
      return
    }
    toast.success("Ad mapped")
    load()
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? "removed user"
  const icps = rules.filter((r) => r.kind === "interest")
  const clinicRules = rules.filter((r) => r.kind === "assign")
  const unmapped = ads.filter((a) => !a.icp)
  const openNew = (kind: Kind) => {
    setError(null)
    setDraft({ ...EMPTY[kind], clinicId: kind === "assign" ? activeClinicId : null })
  }
  const openEdit = (rule: Rule) => {
    setError(null)
    setDraft({ ...rule })
  }

  /** Who a clinic rule hands its leads to, in words. */
  const assignees = (rule: Rule) => {
    if (rule.assignUserIds.length) {
      const names = rule.assignUserIds.map(personName)
      return names.length > 1 ? `${names.join(", ")} — in turn` : names[0]
    }
    if (!rule.assignRole) return "nobody yet"
    const label = roles.find((r) => r.key === rule.assignRole)?.label ?? rule.assignRole
    const many =
      people.filter(
        (p) => p.role === rule.assignRole && (!rule.clinicId || (p.clinicIds ?? []).includes(rule.clinicId)),
      ).length > 1
    return `every ${label}${many ? " — in turn" : ""}`
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lead routing"
        description="Runs on every new lead — Meta, Google, website, Click-to-WhatsApp — before any message goes out."
        actions={
          <Button size="sm" variant="outline" onClick={() => setTesting(true)}>
            <FlaskConical /> Test a lead
          </Button>
        }
      />

      {/* The tester lives in a popup, so the rules and the ads table get the full width. */}
      <Dialog open={testing} onOpenChange={setTesting}>
        <DialogContent className="max-h-[90svh] gap-3 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" /> Test a lead
            </DialogTitle>
            <p className="text-xs text-muted-foreground">Fill what a lead would bring. Nothing is saved or assigned.</p>
          </DialogHeader>
          <Tester bare />
        </DialogContent>
      </Dialog>

      {/* The three steps a lead goes through, so the page reads in order. */}
      <ol className="grid gap-2 sm:grid-cols-3">
        {[
          { icon: MapPin, title: "1. Clinic & team", text: "Nearest clinic gets the lead, and one of its people." },
          { icon: Target, title: "2. ICP", text: "Who the ad was for — picks the right message set." },
          { icon: Clapperboard, title: "3. Ads", text: "Ads with no ICP get the general messages." },
        ].map((s) => (
          <li key={s.title} className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <s.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium">{s.title}</span>
              <span className="block text-xs text-muted-foreground">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-5">
        <div className="min-w-0 space-y-5">
          {/* 1 — Clinics and who gets the lead */}
          <Section
            icon={<MapPin className="h-4 w-4" />}
            title="Clinic & team — who gets the lead"
            blurb={
              <>
                One rule per clinic, with its location. A lead goes to the <b>nearest</b> clinic (city or PIN code on the
                form, else the city in the ad set name). If its location is unknown, the first rule takes it.
              </>
            }
            action={
              <Button size="sm" onClick={() => openNew("assign")}>
                <Plus /> Add rule
              </Button>
            }
          >
            {clinicRules.length === 0 ? (
              <Empty text="No clinic rules yet — new leads stay unassigned." action="Add the first rule" onClick={() => openNew("assign")} />
            ) : (
              <ul className="divide-y divide-border">
                {clinicRules.map((rule, i) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    index={i}
                    onToggle={() => toggle(rule)}
                    onEdit={() => openEdit(rule)}
                    onDelete={() => remove(rule)}
                    title={
                      <>
                        {rule.name}
                        {rule.clinicId && rule.clinicId !== activeClinicId && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                            {clinics.find((c) => c.id === rule.clinicId)?.name ?? "another clinic"}
                          </span>
                        )}
                      </>
                    }
                    when={
                      <>
                        {rule.hubLabel && (
                          <Chip tone="emerald">
                            <MapPin className="h-3 w-3" /> near {rule.hubLabel}
                          </Chip>
                        )}
                        {rule.matchValues ? (
                          <span>
                            {fieldLabel(rule.matchField).toLowerCase()} has{" "}
                            <b className="text-foreground">{words(rule.matchValues).join(" / ")}</b>
                          </span>
                        ) : !rule.hubLabel ? (
                          <span>every lead (default)</span>
                        ) : null}
                      </>
                    }
                    then={
                      <Chip>
                        <Users className="h-3 w-3" /> {assignees(rule)}
                      </Chip>
                    }
                  />
                ))}
              </ul>
            )}
          </Section>

          {/* 2 — ICPs */}
          <Section
            icon={<Target className="h-4 w-4" />}
            title="ICPs — who the ad is for"
            blurb={
              <>
                Every video is made for one ICP. Give it a short code and put that code in the ad set or ad name — leads map
                on their own, and flows send <span className="font-mono">&lt;step&gt;_&lt;code&gt;</span> templates.
              </>
            }
            action={
              <Button size="sm" variant="outline" onClick={() => openNew("interest")}>
                <Plus /> Add ICP
              </Button>
            }
          >
            {icps.length === 0 ? (
              <Empty text="No ICPs yet — every lead gets the general messages." action="Add an ICP" onClick={() => openNew("interest")} />
            ) : (
              <ul className="divide-y divide-border">
                {icps.map((rule, i) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    index={i}
                    onToggle={() => toggle(rule)}
                    onEdit={() => openEdit(rule)}
                    onDelete={() => remove(rule)}
                    title={rule.name}
                    when={
                      <>
                        <span>
                          ad set / ad name has <b className="font-mono text-foreground">{rule.interest}</b>
                        </span>
                        {rule.matchValues && <span>· or {words(rule.matchValues).length} more keyword(s) / ads</span>}
                      </>
                    }
                    then={<Chip tone="primary">templates *_{rule.interest}</Chip>}
                  />
                ))}
              </ul>
            )}
          </Section>

          {/* 3 — Ads seen so far */}
          <Section
            icon={<Clapperboard className="h-4 w-4" />}
            title="Ads without an ICP"
            badge={
              unmapped.length > 0 ? (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  {unmapped.length} without an ICP
                </span>
              ) : null
            }
            blurb="Their leads get the general message. Map each to an ICP here, or rename the ad with the ICP code."
            action={
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/reports?tab=ads" />}>
                Ad performance <ArrowRight />
              </Button>
            }
          >
            {unmapped.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Every ad that sent a lead has an ICP. How each one converts is in Reports → Ad performance.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {unmapped.map((ad) => (
                  <li key={`${ad.provider}:${ad.adId ?? ad.adName}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{ad.adName ?? ad.formName ?? "Unnamed ad"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {[ad.adsetName, ad.campaignName].filter(Boolean).join(" · ") || ad.provider} · {ad.leads}{" "}
                        {ad.leads === 1 ? "lead" : "leads"}
                      </div>
                    </div>
                    {icps.length && (ad.adId || ad.adName) ? (
                      <select
                        defaultValue=""
                        onChange={(e) => e.target.value && mapAd(ad, e.target.value)}
                        aria-label={`Map ${ad.adName ?? "this ad"} to an ICP`}
                        className={`${inputClass} w-auto border-amber-500/50 text-xs`}
                      >
                        <option value="">Map to ICP…</option>
                        {icps.map((r) => (
                          <option key={r.id} value={r.interest ?? ""}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-amber-700 dark:text-amber-400">add an ICP first</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

      </div>

      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90svh] gap-4 overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {draft?.kind === "interest"
                ? draft.id
                  ? "Edit ICP"
                  : "New ICP"
                : draft?.id
                  ? "Edit clinic rule"
                  : "New clinic rule"}
            </DialogTitle>
          </DialogHeader>
          {draft &&
            (draft.kind === "interest" ? (
              <IcpForm draft={draft} set={(p) => setDraft({ ...draft, ...p })} />
            ) : (
              <ClinicForm
                draft={draft}
                set={(p) => setDraft({ ...draft, ...p })}
                clinics={clinics}
                activeClinicId={activeClinicId}
                people={people}
                roles={roles}
              />
            ))}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !draft?.name.trim()}>
              {saving && <PredictSpinner className="size-4" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Section({
  icon,
  title,
  blurb,
  action,
  badge,
  children,
}: {
  icon: React.ReactNode
  title: string
  blurb: React.ReactNode
  action?: React.ReactNode
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="text-primary">{icon}</span>
            {title}
            {badge}
          </h2>
          <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">{blurb}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Empty({ text, action, onClick }: { text: string; action: string; onClick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button size="sm" variant="outline" onClick={onClick}>
        <Plus /> {action}
      </Button>
    </div>
  )
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "emerald" | "primary" }) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : tone === "primary"
        ? "bg-primary/10 text-primary"
        : "bg-muted text-foreground"
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${cls}`}>{children}</span>
}

/** One rule as a sentence: when this → then that, with its controls on the right. */
function RuleRow({
  rule,
  index,
  title,
  when,
  then,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: Rule
  index: number
  title: React.ReactNode
  when: React.ReactNode
  then: React.ReactNode
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const locked = rule.editable === false
  return (
    <li className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center ${rule.active ? "" : "opacity-55"}`}>
      <span className="hidden size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground sm:flex">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {title}
          {!rule.active && <span className="text-[11px] font-normal text-muted-foreground">paused</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {when}
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          {then}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <label className="mr-1 flex items-center gap-1.5 text-xs text-muted-foreground" title={rule.active ? "Pause" : "Resume"}>
          <Switch size="sm" checked={rule.active} onCheckedChange={onToggle} disabled={locked} />
          {rule.active ? "On" : "Off"}
        </label>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onEdit}
          disabled={locked}
          title={locked ? "Another clinic's rule" : "Edit"}
          aria-label="Edit"
        >
          <Pencil />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onDelete} disabled={locked} aria-label="Delete" title="Delete">
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}

function ClinicForm({
  draft,
  set,
  clinics,
  activeClinicId,
  people,
  roles,
}: {
  draft: Draft
  set: (patch: Partial<Draft>) => void
  clinics: { id: string; name: string }[]
  activeClinicId: string | null
  people: Person[]
  roles: { key: string; label: string }[]
}) {
  // Only the chosen clinic's people — the same set the rule will share leads among.
  const ruleClinic = draft.clinicId ?? activeClinicId
  const rolePeople = people.filter(
    (p) => (!draft.assignRole || p.role === draft.assignRole) && (!ruleClinic || (p.clinicIds ?? []).includes(ruleClinic)),
  )
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Rule name</label>
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Delhi clinic" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Leads belong to clinic</label>
          <select
            value={draft.clinicId ?? activeClinicId ?? ""}
            onChange={(e) => set({ clinicId: e.target.value || null })}
            className={inputClass}
          >
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Clinic location</label>
          <select value={draft.hubLabel ?? ""} onChange={(e) => set({ hubLabel: e.target.value || null })} className={inputClass}>
            <option value="">— no location —</option>
            {CLINIC_PLACES.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
          <p className={hintClass}>With a location, leads go to the nearest clinic — no keywords needed.</p>
        </div>
        <div>
          <label className={labelClass}>Order</label>
          <input
            type="number"
            value={draft.priority}
            onChange={(e) => set({ priority: Number(e.target.value) })}
            className={inputClass}
          />
          <p className={hintClass}>Lower runs first. The first rule takes leads with no known location.</p>
        </div>
      </div>

      <div>
        <label className={labelClass}>Keywords (optional — for special cases)</label>
        <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <select value={draft.matchField} onChange={(e) => set({ matchField: e.target.value })} className={inputClass}>
            {MATCH_FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <input
            value={draft.matchValues}
            onChange={(e) => set({ matchValues: e.target.value })}
            placeholder="contains… e.g. corporate"
            className={inputClass}
          />
        </div>
        <p className={hintClass}>e.g. a campaign whose leads should always go to one person. Separate with commas.</p>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Give leads to role</label>
            <select
              value={draft.assignRole ?? ""}
              onChange={(e) => set({ assignRole: e.target.value || null, assignUserIds: [] })}
              className={inputClass}
            >
              <option value="">— pick a role —</option>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <p className={labelClass}>
            Only these people (none ticked = everyone in the role at this clinic). Several take turns.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {rolePeople.map((p) => {
              const on = draft.assignUserIds.includes(p.id)
              return (
                <Button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    set({ assignUserIds: on ? draft.assignUserIds.filter((x) => x !== p.id) : [...draft.assignUserIds, p.id] })
                  } size="sm" variant={on ? "default" : "outline"}>
                  {p.name}
                  {!draft.assignRole && p.role ? ` · ${p.role}` : ""}
                </Button>
              )
            })}
            {rolePeople.length === 0 && (
              <span className="text-xs text-amber-700 dark:text-amber-400">
                Nobody at this clinic holds this role yet — leads will wait in its pool. Add people on the Clinics page.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function IcpForm({ draft, set }: { draft: Draft; set: (patch: Partial<Draft>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div>
          <label className={labelClass}>ICP name</label>
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Working women 35–50 with knee pain"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Code</label>
          <input
            value={draft.interest ?? ""}
            onChange={(e) => set({ interest: e.target.value })}
            placeholder="knee_pain"
            className={`${inputClass} font-mono`}
          />
        </div>
      </div>
      {draft.interest && (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Put <b className="font-mono text-foreground">{codeOf(draft.interest)}</b> in the ad set or ad name (e.g.{" "}
          <span className="font-mono">Delhi | {codeOf(draft.interest)} | video 3</span>) and its leads map here. Templates:{" "}
          <span className="font-mono">lead_day1_{codeOf(draft.interest)}</span>.
        </p>
      )}
      <div>
        <label className={labelClass}>Also match (optional)</label>
        <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <select value={draft.matchField} onChange={(e) => set({ matchField: e.target.value })} className={inputClass}>
            {MATCH_FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <input
            value={draft.matchValues}
            onChange={(e) => set({ matchValues: e.target.value })}
            placeholder="contains… e.g. knee, ghutna, joint pain"
            className={inputClass}
          />
        </div>
      </div>
      <div className="w-40">
        <label className={labelClass}>Order</label>
        <input
          type="number"
          value={draft.priority}
          onChange={(e) => set({ priority: Number(e.target.value) })}
          className={inputClass}
        />
        <p className={hintClass}>If an ad matches two ICPs, the lower number wins.</p>
      </div>
    </div>
  )
}

/** Try a made-up lead against the live rules without assigning anything. */
/** "bare": inside the popup, which brings its own title and frame. */
function Tester({ bare = false }: { bare?: boolean }) {
  const [facts, setFacts] = useState({ city: "", pincode: "", state: "", adsetName: "", adName: "" })
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{
    assign: { name: string; routedBy: string; distanceKm: number | null; hub: string | null } | null
    location: { label: string; from: string } | null
    icp: { name: string; code: string } | null
  } | null>(null)

  async function run() {
    setChecking(true)
    try {
      const res = await fetch("/api/lead-rules/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(facts),
      })
      setResult(await res.json())
    } finally {
      setChecking(false)
    }
  }

  const why: Record<string, string> = {
    nearest: "nearest clinic",
    keyword: "keyword match",
    default: "location unknown — default rule",
  }

  return (
    <section className={bare ? "" : "rounded-lg border border-border"}>
      {!bare && (
        <div className="border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="h-4 w-4 text-primary" /> Test a lead
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Fill what a lead would bring. Nothing is saved or assigned.</p>
        </div>
      )}
      <div className={bare ? "space-y-2.5" : "space-y-2.5 p-4"}>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["city", "City"],
              ["pincode", "PIN code"],
              ["state", "State"],
              ["adsetName", "Ad set name"],
              ["adName", "Ad name"],
            ] as const
          ).map(([k, label]) => (
            <input
              key={k}
              value={facts[k]}
              onChange={(e) => setFacts({ ...facts, [k]: e.target.value })}
              placeholder={label}
              className={`${inputClass} ${k === "adName" ? "col-span-2" : ""}`}
            />
          ))}
        </div>
        <Button size="sm" className="w-full" onClick={run} disabled={checking}>
          {checking ? <PredictSpinner className="size-4" /> : <FlaskConical />} Check where it goes
        </Button>

        {result && (
          <dl className="divide-y divide-border rounded-md border border-border text-sm">
            <div className="px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">Location</dt>
              <dd className="font-medium">
                {result.location ? result.location.label : "unknown"}
                {result.location && (
                  <span className="text-xs font-normal text-muted-foreground"> · from {result.location.from}</span>
                )}
              </dd>
            </div>
            <div className="px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">Goes to</dt>
              <dd className="font-medium">
                {result.assign?.name ?? "nobody — stays unassigned"}
                {result.assign && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {why[result.assign.routedBy] ?? result.assign.routedBy}
                    {result.assign.distanceKm != null && `, ${result.assign.distanceKm} km from ${result.assign.hub}`}
                  </span>
                )}
              </dd>
            </div>
            <div className="px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">ICP</dt>
              <dd className="font-medium">
                {result.icp ? `${result.icp.name} (${result.icp.code})` : "none — gets general templates"}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  )
}

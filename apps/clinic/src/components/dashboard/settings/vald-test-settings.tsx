"use client"

import { useEffect, useMemo, useState } from "react"
import { PlayCircle, Plus, Search, Star } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import type { ValdTestDef } from "@workspace/db/vald-catalog"
import { refreshValdTests } from "@/src/lib/dynamo/use-vald-tests"
import { RecordBadge, RecordSection } from "@/src/components/dashboard/patients/record-ui"

const INPUT =
  "w-full rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-sm text-black dark:border-white/10 dark:bg-black dark:text-white"

/**
 * The clinic's DynaMo tests (vald_test_type): every test the DynaMo offers,
 * seeded with VALD's steps and video. Here the clinic decides which are
 * offered, which come first, and — later — puts its own video in place of
 * VALD's, or adds a test of its own.
 */
export function ValdTestSettings() {
  const [tests, setTests] = useState<ValdTestDef[] | null>(null)
  const [query, setQuery] = useState("")
  const [region, setRegion] = useState("all")
  const [show, setShow] = useState<"offered" | "all" | "off">("offered")
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function load() {
    const res = await fetch("/api/staff/vald/tests?all=1")
    const data = await res.json().catch(() => null)
    setTests(res.ok ? (data?.tests ?? []) : [])
  }
  useEffect(() => {
    void load()
  }, [])

  async function patch(key: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/staff/vald/tests/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      toast.error(data?.error ?? "Could not save the test.")
      return false
    }
    setTests((prev) => prev?.map((t) => (t.key === key ? data.test : t)) ?? prev)
    refreshValdTests()
    return true
  }

  const regions = useMemo(() => [...new Set((tests ?? []).map((t) => t.region))].sort(), [tests])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (tests ?? []).filter(
      (t) =>
        (region === "all" || t.region === region) &&
        (show === "all" || (show === "offered" ? t.active !== false : t.active === false)) &&
        (!q || `${t.label} ${t.region} ${t.positionLabel}`.toLowerCase().includes(q)),
    )
  }, [tests, query, region, show])

  const total = tests?.length ?? 0
  const offered = tests?.filter((t) => t.active !== false).length ?? 0
  const withVideo = tests?.filter((t) => t.videoUrl).length ?? 0

  return (
    <RecordSection
      title="VALD tests"
      description={`The DynaMo tests offered on the patient page and the prescription — ${offered} of ${total} switched on, ${withVideo} with a how-to video. Seeded from VALD; yours to change.`}
      action={
        <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
          <Plus className="size-3.5" /> Add a test
        </Button>
      }
    >
      {adding && (
        <AddTest
          regions={regions}
          onAdded={(t) => {
            setTests((prev) => [t, ...(prev ?? [])])
            refreshValdTests()
            setAdding(false)
          }}
        />
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-black/40 dark:text-white/35" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tests" className={`${INPUT} pl-8`} />
        </div>
        <select value={region} onChange={(e) => setRegion(e.target.value)} className={`${INPUT} w-auto`}>
          <option value="all">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className={`${INPUT} w-auto`}>
          <option value="offered">Switched on</option>
          <option value="off">Switched off</option>
          <option value="all">All</option>
        </select>
      </div>

      {tests == null ? (
        <p className="py-6 text-center text-sm text-black/50 dark:text-white/40">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-black/50 dark:text-white/40">No test matches.</p>
      ) : (
        <ul className="divide-y divide-black/[0.06] rounded-lg border border-black/10 dark:divide-white/[0.06] dark:border-white/10">
          {shown.slice(0, 200).map((t) => (
            <li key={t.key} className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label={t.featured ? "Remove from Used at the clinic" : "Add to Used at the clinic"}
                  title={t.featured ? "Shown first — click to remove" : "Show first"}
                  onClick={() => void patch(t.key, { featured: !t.featured })}
                  className={t.featured ? "text-amber-500" : "text-black/25 hover:text-amber-500 dark:text-white/25"}
                >
                  <Star className="size-4" fill={t.featured ? "currentColor" : "none"} />
                </button>
                <span className={`text-sm font-medium ${t.active === false ? "text-black/40 line-through dark:text-white/35" : ""}`}>{t.label}</span>
                <span className="text-xs text-black/50 dark:text-white/40">
                  {t.region} · {t.kind === "rom" ? "ROM" : "Strength"} · {t.positionLabel}
                  {t.laterality === "None" ? " · one measurement" : ""}
                </span>
                {t.videoUrl && (
                  <RecordBadge tone={t.videoSource === "clinic" ? "good" : "neutral"}>
                    <PlayCircle className="mr-1 size-3" /> {t.videoSource === "clinic" ? "Clinic video" : "VALD video"}
                  </RecordBadge>
                )}
                {t.origin === "clinic" && <RecordBadge tone="primary">Added here</RecordBadge>}
                <div className="ml-auto flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(editing === t.key ? null : t.key)}>
                    {editing === t.key ? "Close" : "Edit"}
                  </Button>
                  <Button
                    size="sm"
                    variant={t.active === false ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => void patch(t.key, { active: t.active === false })}
                  >
                    {t.active === false ? "Switch on" : "Switch off"}
                  </Button>
                </div>
              </div>
              {editing === t.key && <EditTest test={t} onSave={async (body) => (await patch(t.key, body)) && setEditing(null)} />}
            </li>
          ))}
        </ul>
      )}
      {shown.length > 200 && (
        <p className="mt-2 text-xs text-black/50 dark:text-white/40">Showing 200 of {shown.length} — search or pick a region to narrow it.</p>
      )}
    </RecordSection>
  )
}

function EditTest({ test, onSave }: { test: ValdTestDef; onSave: (body: Record<string, unknown>) => Promise<unknown> }) {
  const [label, setLabel] = useState(test.label)
  const [setup, setSetup] = useState(test.setup ?? "")
  const [videoUrl, setVideoUrl] = useState(test.videoUrl ?? "")
  const [saving, setSaving] = useState(false)
  return (
    <div className="mt-2 grid gap-2 rounded-md bg-black/[0.03] p-2.5 dark:bg-white/[0.04]">
      <label className="grid gap-1 text-xs text-black/55 dark:text-white/40">
        Name
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={INPUT} />
      </label>
      <label className="grid gap-1 text-xs text-black/55 dark:text-white/40">
        How to set the patient up
        <textarea value={setup} onChange={(e) => setSetup(e.target.value)} rows={5} className={INPUT} />
      </label>
      <label className="grid gap-1 text-xs text-black/55 dark:text-white/40">
        How-to video — a Vimeo or YouTube link, or a video file link (https)
        <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" className={INPUT} />
      </label>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            await onSave({ label, setup: setup || null, videoUrl: videoUrl.trim() || null })
            setSaving(false)
          }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}

function AddTest({ regions, onAdded }: { regions: string[]; onAdded: (t: ValdTestDef) => void }) {
  const [form, setForm] = useState({
    label: "",
    region: regions[0] ?? "Knee",
    category: "Strength" as "Strength" | "RangeofMotion",
    movement: "",
    positionLabel: "",
    laterality: "Bilateral" as "Bilateral" | "None",
    setup: "",
    videoUrl: "",
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true)
    const res = await fetch("/api/staff/vald/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        movement: form.movement.replace(/\s+/g, ""),
        position: form.positionLabel.replace(/[^A-Za-z0-9]/g, "") || "Standard",
        setup: form.setup || null,
        videoUrl: form.videoUrl.trim() || null,
      }),
    })
    const data = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok) {
      toast.error(data?.error ?? "Could not add the test.")
      return
    }
    toast.success(`${data.test.label} added`)
    onAdded(data.test)
  }

  return (
    <div className="mb-3 grid gap-2 rounded-lg border border-black/10 p-3 sm:grid-cols-2 dark:border-white/10">
      <label className="grid gap-1 text-xs text-black/55 dark:text-white/40">
        Name
        <input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Ankle dorsiflexion" className={INPUT} />
      </label>
      <label className="grid gap-1 text-xs text-black/55 dark:text-white/40">
        Body region
        <input value={form.region} onChange={(e) => set("region", e.target.value)} list="vald-regions" className={INPUT} />
        <datalist id="vald-regions">
          {regions.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </label>
      <label className="grid gap-1 text-xs text-black/55 dark:text-white/40">
        Type
        <select value={form.category} onChange={(e) => set("category", e.target.value)} className={INPUT}>
          <option value="Strength">Strength (force)</option>
          <option value="RangeofMotion">Range of motion</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs text-black/55 dark:text-white/40">
        Movement
        <input value={form.movement} onChange={(e) => set("movement", e.target.value)} placeholder="Dorsiflexion" className={INPUT} />
      </label>
      <label className="grid gap-1 text-xs text-black/55 dark:text-white/40">
        Position
        <input value={form.positionLabel} onChange={(e) => set("positionLabel", e.target.value)} placeholder="Supine" className={INPUT} />
      </label>
      <label className="grid gap-1 text-xs text-black/55 dark:text-white/40">
        Sides
        <select value={form.laterality} onChange={(e) => set("laterality", e.target.value)} className={INPUT}>
          <option value="Bilateral">Left and right</option>
          <option value="None">One measurement</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs text-black/55 sm:col-span-2 dark:text-white/40">
        How to set the patient up
        <textarea value={form.setup} onChange={(e) => set("setup", e.target.value)} rows={3} className={INPUT} />
      </label>
      <label className="grid gap-1 text-xs text-black/55 sm:col-span-2 dark:text-white/40">
        How-to video link (optional)
        <input value={form.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://…" className={INPUT} />
      </label>
      <div className="flex justify-end sm:col-span-2">
        <Button size="sm" disabled={saving || !form.label.trim() || !form.movement.trim()} onClick={() => void save()}>
          {saving ? "Adding…" : "Add test"}
        </Button>
      </div>
    </div>
  )
}

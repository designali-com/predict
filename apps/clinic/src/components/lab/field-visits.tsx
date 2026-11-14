"use client"

import { useCallback, useEffect, useState } from "react"
import { Building2, Home, MapPin, Phone, RefreshCw } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"
import { CollectSteps } from "./collect-steps"
import { StageBadge, istDay, rupees, type LabOrderRow } from "./lab-shared"

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
const isoDay = (iso: string) => istDay(new Date(iso))

/**
 * The field technician's day, on their phone: the visits assigned to them, in
 * time order, each with the patient's number to call, the address to open in
 * Maps, and the steps — on the way, sample taken (kit code), not taken. They
 * see nothing that is not theirs.
 */
export function FieldVisits() {
  const [visits, setVisits] = useState<LabOrderRow[] | null>(null)
  const [busy, setBusy] = useState<{ id: string; kind: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/field/visits")
    const data = await res.json().catch(() => null)
    setVisits(res.ok ? (data?.visits ?? []) : [])
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => !document.hidden && load(), 60_000)
    return () => clearInterval(t)
  }, [load])

  async function act(id: string, kind: string, body: Record<string, unknown>, done: string) {
    setBusy({ id, kind })
    try {
      const res = await fetch(`/api/field/visits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: kind, ...body }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok) return toast.error(out?.error ?? "That did not work")
      toast.success(done)
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (visits === null) {
    return (
      <div className="flex justify-center py-16">
        <PredictSpinner />
      </div>
    )
  }

  const today = istDay()
  const pending = visits.filter((v) => v.stage === "booked" || v.stage === "on_the_way" || v.stage === "to_book")
  const todays = pending.filter((v) => v.scheduledAt && isoDay(v.scheduledAt) <= today)
  const later = pending.filter((v) => !v.scheduledAt || isoDay(v.scheduledAt) > today)
  const done = visits.filter((v) => v.stage === "collected" || v.stage === "in_lab" || v.stage === "reported")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm">
          <b>{todays.length}</b> visit{todays.length === 1 ? "" : "s"} today · <b>{done.length}</b> done
        </p>
        <Button size="sm" variant="ghost" onClick={() => load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Group title="Today" empty="No visits for today.">
        {todays.map((v) => (
          <VisitCard key={v.id} v={v} busy={busy?.id === v.id ? busy.kind : null} act={act} />
        ))}
      </Group>

      {later.length > 0 && (
        <Group title="Coming up">
          {later.map((v) => (
            <VisitCard key={v.id} v={v} busy={busy?.id === v.id ? busy.kind : null} act={act} />
          ))}
        </Group>
      )}

      {done.length > 0 && (
        <Group title="Done today">
          {done.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-lg border border-black/12 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black">
              <span className="min-w-0">
                <span className="block truncate font-medium">{v.patient.name}</span>
                {v.kitCode && <span className="font-mono text-[11px] text-muted-foreground">Kit {v.kitCode}</span>}
              </span>
              <StageBadge stage={v.stage} />
            </div>
          ))}
        </Group>
      )}
    </div>
  )
}

function Group({ title, empty, children }: { title: string; empty?: string; children: React.ReactNode }) {
  const list = Array.isArray(children) ? children : [children]
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {list.length === 0 || list.every((c) => !c) ? (
        <p className="rounded-lg border border-dashed border-black/15 p-6 text-center text-sm text-muted-foreground dark:border-white/15">{empty}</p>
      ) : (
        children
      )}
    </section>
  )
}

function VisitCard({
  v,
  busy,
  act,
}: {
  v: LabOrderRow
  busy: string | null
  act: (id: string, kind: string, body: Record<string, unknown>, done: string) => void
}) {
  const phone = v.patient.phone?.replace(/\D/g, "") ?? ""
  const due = Math.max(0, v.totalInPaise - v.paidInPaise)
  const home = v.collectionMode === "home"
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-black/12 bg-white p-3 dark:border-white/10 dark:bg-black">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-base font-semibold">
            {v.scheduledAt ? time(v.scheduledAt) : "—"}
            <span className="text-xs font-normal text-muted-foreground">{v.scheduledAt ? dayLabel(v.scheduledAt) : ""}</span>
          </p>
          <p className="truncate text-sm font-medium">{v.patient.name}</p>
          <p className="text-xs text-muted-foreground">
            {v.items} test{v.items === 1 ? "" : "s"} · {v.hospital.name ?? "Predict"}
          </p>
        </div>
        <StageBadge stage={v.stage} />
      </div>

      <div className="flex items-start gap-2 text-sm">
        {home ? <Home className="mt-0.5 h-4 w-4 shrink-0" /> : <Building2 className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>{home ? (v.collectionAddress ?? "Address not given") : "At the Predict centre"}</span>
      </div>

      <div className="flex gap-2">
        {phone && (
          <Button size="sm" variant="outline" className="flex-1" nativeButton={false} render={<a href={`tel:+${phone}`} />}>
            <Phone className="h-4 w-4" /> Call
          </Button>
        )}
        {home && v.collectionAddress && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            nativeButton={false}
            render={<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.collectionAddress)}`} target="_blank" rel="noreferrer" />}
          >
            <MapPin className="h-4 w-4" /> Map
          </Button>
        )}
      </div>

      {due > 0 && (
        <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          {rupees(due)} not paid yet.
        </p>
      )}

      <CollectSteps
        large
        canStart={home && v.stage === "booked"}
        busy={busy}
        onOnTheWay={() => act(v.id, "on_the_way", {}, "Marked on the way — the patient is told")}
        onCollected={(kitCode) => act(v.id, "collected", { kitCode }, "Sample taken")}
        onNotCollected={(reason) => act(v.id, "not_collected", { reason }, "Sent back to the lab to book again")}
      />
    </article>
  )
}

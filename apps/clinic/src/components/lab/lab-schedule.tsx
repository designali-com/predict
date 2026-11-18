"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Building2, ChevronLeft, ChevronRight, Home } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"
import { PredictSpinner } from "@/src/components/predict-loader"
import { StageBadge, istDay, type LabOrderRow } from "./lab-shared"
import { useLabHref } from "./lab-base"

function dayTitle(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
}

function shift(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })

/**
 * The day's sample collections, in time order: at the centre and on the road.
 * A technician's run for the day is the home column.
 */
export function LabSchedule() {
  const [day, setDay] = useState(istDay())
  const [orders, setOrders] = useState<LabOrderRow[] | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/lab/orders?day=${day}`)
    const data = await res.json().catch(() => null)
    setOrders(res.ok ? (data?.orders ?? []).filter((o: LabOrderRow) => o.stage !== "cancelled") : [])
  }, [day])

  useEffect(() => {
    setOrders(null)
    load()
  }, [load])

  const centre = (orders ?? []).filter((o) => o.collectionMode !== "home")
  const home = (orders ?? []).filter((o) => o.collectionMode === "home")

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Schedule"
        description={dayTitle(day)}
        actions={
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" aria-label="Previous day" onClick={() => setDay(shift(day, -1))}>
              <ChevronLeft />
            </Button>
            <input
              type="date"
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="rounded-md border border-black/18 bg-white px-2 py-1 text-sm dark:border-white/15 dark:bg-black"
            />
            <Button size="icon-sm" variant="outline" aria-label="Next day" onClick={() => setDay(shift(day, 1))}>
              <ChevronRight />
            </Button>
            {day !== istDay() && (
              <Button size="sm" variant="ghost" onClick={() => setDay(istDay())}>
                Today
              </Button>
            )}
          </div>
        }
      />

      {orders === null ? (
        <div className="flex justify-center py-12">
          <PredictSpinner className="size-6" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Column title="At the centre" icon={Building2} rows={centre} />
          <Column title="Home collection" icon={Home} rows={home} />
        </div>
      )}
    </div>
  )
}

function Column({
  title,
  icon: Icon,
  rows,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  rows: LabOrderRow[]
}) {
  const href = useLabHref()
  return (
    <section className="rounded-lg border border-black/12 bg-white dark:border-white/10 dark:bg-black">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
        <span className="ml-auto text-xs font-normal text-muted-foreground">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Nothing booked.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={href(`/orders/${o.id}`)} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40">
                <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">{o.scheduledAt ? time(o.scheduledAt) : "—"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{o.patient.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {o.patient.phone?.replace(/^91(?=\d{10}$)/, "")} · {o.hospital.name ?? "—"}
                    {o.technician ? ` · ${o.technician}` : ""}
                  </span>
                </span>
                <StageBadge stage={o.stage} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

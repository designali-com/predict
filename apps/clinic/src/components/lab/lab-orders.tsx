"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Home, Building2, Search, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"
import { useLabHref } from "./lab-base"
import { PredictSpinner } from "@/src/components/predict-loader"
import { StageBadge, formatSlot, rupees, type LabOrderRow, type LabStage } from "./lab-shared"

const TABS: { value: LabStage | "open"; label: string }[] = [
  { value: "to_book", label: "To book" },
  { value: "booked", label: "Booked" },
  { value: "on_the_way", label: "On the way" },
  { value: "collected", label: "Collected" },
  { value: "in_lab", label: "In lab" },
  { value: "reported", label: "Reported" },
  { value: "cancelled", label: "Cancelled" },
]

/**
 * Every blood-test order waiting on the lab, by where it is: to book, booked,
 * collected, reported. A doctor writes the order (ours or a partner
 * hospital's); everything after that happens from here.
 */
export function LabOrders() {
  const href = useLabHref()
  const [tab, setTab] = useState<LabStage | "open">("to_book")
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const [orders, setOrders] = useState<LabOrderRow[] | null>(null)
  const [counts, setCounts] = useState<Record<LabStage, number> | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    // A search looks across every stage; otherwise the tab.
    if (!search) params.set("stage", tab)
    if (search) params.set("q", search)
    const res = await fetch(`/api/lab/orders?${params}`)
    const data = await res.json().catch(() => null)
    setOrders(res.ok ? (data?.orders ?? []) : [])
    if (data?.counts) setCounts(data.counts)
  }, [tab, search])

  useEffect(() => {
    setOrders(null)
    load()
    const t = setInterval(() => !document.hidden && load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Blood test orders" description="From Predict clinics and partner hospitals." />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <Button
              key={t.value}
              type="button"
              size="sm"
              variant={tab === t.value && !search ? "default" : "outline"}
              onClick={() => {
                setTab(t.value)
                setQuery("")
              }}
            >
              {t.label}
              {counts && t.value !== "open" && (
                <span className="rounded bg-black/10 px-1.5 text-[11px] tabular-nums dark:bg-white/15">{counts[t.value]}</span>
              )}
            </Button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, mobile or patient ID"
            className="w-full rounded-md border border-black/18 bg-white py-1.5 pl-8 pr-8 text-sm focus:border-black/40 focus:outline-none dark:border-white/15 dark:bg-black"
          />
          {query && (
            <button type="button" aria-label="Clear" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-black/12 bg-white dark:border-white/10 dark:bg-black">
        {orders === null ? (
          <div className="flex justify-center py-12">
            <PredictSpinner className="size-6" />
          </div>
        ) : orders.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {search ? `No order matches “${search}”.` : "Nothing here."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Patient</th>
                  <th className="px-3 py-2 font-medium">From</th>
                  <th className="px-3 py-2 font-medium">Tests</th>
                  <th className="px-3 py-2 font-medium">Collection</th>
                  <th className="px-3 py-2 font-medium">Payment</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const due = Math.max(0, o.totalInPaise - o.paidInPaise)
                  return (
                    <tr key={o.id} className="border-t border-border hover:bg-muted/40">
                      <td className="px-3 py-2.5">
                        <Link href={href(`/orders/${o.id}`)} className="block">
                          <span className="font-medium hover:underline">{o.patient.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {o.patient.code}
                            {o.patient.phone ? ` · ${o.patient.phone.replace(/^91(?=\d{10}$)/, "")}` : ""}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1.5">
                          {o.hospital.name ?? "—"}
                          {o.hospital.partner && (
                            <span className="rounded bg-sky-500/15 px-1 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400">partner</span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">{o.orderedBy ? `Dr. ${o.orderedBy}` : "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{o.items}</td>
                      <td className="px-3 py-2.5">
                        {o.scheduledAt ? (
                          <span className="flex items-center gap-1.5">
                            {o.collectionMode === "home" ? <Home className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                            {formatSlot(o.scheduledAt)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Not booked</span>
                        )}
                        {o.technician && <span className="block text-xs text-muted-foreground">{o.technician}</span>}
                        {o.kitCode && <span className="block font-mono text-[11px] text-muted-foreground">Kit {o.kitCode}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {o.totalInPaise === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : due === 0 ? (
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">Paid</span>
                        ) : (
                          <span>
                            <span className="font-medium text-amber-700 dark:text-amber-400">{rupees(due)} due</span>
                            <span className="block text-xs text-muted-foreground">of {rupees(o.totalInPaise)}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <StageBadge stage={o.stage} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { Building2, ExternalLink } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"

type Status = "open" | "referred" | "in_progress" | "completed" | "cancelled"

interface Referral {
  id: string
  services: string[]
  status: Exclude<Status, "open">
  note: string | null
  createdAt: string
  patientCode: string
  firstName: string
  lastName: string
  mobile: string
  clinicName: string
  clinicShortName: string | null
  referredBy: string | null
  chartUrl: string | null
}

const TABS: { value: Status; label: string }[] = [
  { value: "referred", label: "New" },
  { value: "in_progress", label: "With Predict" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Withdrawn" },
]

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * Patients referred to Predict by the clinics and partner hospitals, for
 * diagnosis. New ones are taken on (or move on by themselves when a blood
 * test is ordered), then marked completed once the results are in. The work
 * itself — ordering tests, VALD, biological age — happens on the patient's chart.
 */
export function LabReferrals() {
  const [tab, setTab] = useState<Status>("referred")
  const [rows, setRows] = useState<Referral[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/lab/referrals?status=${tab}`)
    const data = await res.json().catch(() => null)
    setRows(res.ok ? (data?.referrals ?? []) : [])
    if (data?.counts) setCounts(data.counts)
    if (data?.services) setLabels(Object.fromEntries(data.services.map((s: { key: string; label: string }) => [s.key, s.label])))
  }, [tab])

  useEffect(() => {
    setRows(null)
    load()
    const t = setInterval(() => !document.hidden && load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  async function move(referralId: string, status: "in_progress" | "completed") {
    setBusy(referralId)
    const res = await fetch("/api/lab/referrals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referralId, status }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) return toast.error(d.error ?? "Could not update")
    toast.success(status === "completed" ? "Marked completed" : "Taken on")
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Referrals" description="Patients the clinics and partner hospitals have referred to Predict." />

      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Button key={t.value} type="button" size="sm" variant={tab === t.value ? "default" : "outline"} onClick={() => setTab(t.value)}>
            {t.label}
            <span className="rounded bg-black/10 px-1.5 text-[11px] tabular-nums dark:bg-white/15">{counts[t.value] ?? 0}</span>
          </Button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-black/12 bg-white dark:border-white/10 dark:bg-black">
        {rows === null ? (
          <div className="flex justify-center py-12">
            <PredictSpinner className="size-6" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Patient</th>
                  <th className="px-3 py-2 font-medium">From</th>
                  <th className="px-3 py-2 font-medium">For</th>
                  <th className="px-3 py-2 font-medium">Referred</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-black/8 align-top dark:border-white/8">
                    <td className="px-3 py-2">
                      <p className="font-medium">{[r.firstName, r.lastName].filter(Boolean).join(" ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.patientCode} · {r.mobile}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        {r.clinicShortName || r.clinicName}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.services.map((s) => labels[s] ?? s).join(", ")}
                      {r.note && <p className="mt-0.5 text-muted-foreground">“{r.note}”</p>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {day(r.createdAt)}
                      {r.referredBy ? ` · ${r.referredBy}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        {r.chartUrl && (
                          <a href={r.chartUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                            Chart <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {r.status === "referred" && (
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => move(r.id, "in_progress")}>
                            Take on
                          </Button>
                        )}
                        {r.status === "in_progress" && (
                          <Button size="sm" disabled={busy !== null} onClick={() => move(r.id, "completed")}>
                            {busy === r.id && <PredictSpinner className="size-4" />}
                            Mark completed
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

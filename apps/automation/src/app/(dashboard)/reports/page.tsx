"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { BarChart3, Bot, Clapperboard, TriangleAlert } from "lucide-react"
import { PageHeader } from "@workspace/ui/components/page-header"
import { AutomationReport } from "@/src/components/reports/automation-report"
import { AdsPerformance } from "@/src/components/ads-performance"

type Tab = "overview" | "automation" | "ads"

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "automation", label: "WhatsApp automation", icon: Bot },
  { key: "ads", label: "Ad performance", icon: Clapperboard },
]

/**
 * Every report in one place: lead to money (Overview), what the WhatsApp
 * automations convert (week by week), and which ads are worth the spend.
 * The tab is in the address (?tab=), so a link opens the right one.
 */
export default function ReportsPage() {
  return (
    <Suspense>
      <Reports />
    </Suspense>
  )
}

function Reports() {
  const router = useRouter()
  const params = useSearchParams()
  const asked = params.get("tab") as Tab | null
  const tab: Tab = asked && TABS.some((t) => t.key === asked) ? asked : "overview"
  const go = (t: Tab) => router.replace(t === "overview" ? "/reports" : `/reports?tab=${t}`, { scroll: false })

  const tabs = (
    <nav aria-label="Reports" className="flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => {
        const on = t.key === tab
        const Icon = t.icon
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => go(t.key)}
            aria-current={on ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              on ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" /> {t.label}
          </button>
        )
      })}
    </nav>
  )

  if (tab === "overview") return <OverviewReport tabs={tabs} />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description={
          tab === "automation"
            ? "What each WhatsApp automation turns into — delivered, read, replied, booked, visited, paid — week by week, by the week people entered the flow."
            : "Which ads bring leads, and how far those leads go. Each person counts once, for the ad that brought them first."
        }
      />
      {tabs}
      {tab === "automation" ? (
        <AutomationReport scope="clinic" />
      ) : (
        <div className="rounded-lg border border-border">
          <AdsPerformance icps={[]} onMap={() => undefined} />
        </div>
      )}
    </div>
  )
}

interface Funnel {
  leads: number
  contacted: number
  booked: number
  attended: number
  patients: number
  unassigned: number
  revenueInPaise: number
}

interface SourceRow {
  key: string
  label: string
  leads: number
  booked: number
  attended: number
  revenueInPaise: number
}

interface TeamRow {
  userId: string | null
  name: string
  leads: number
  worked: number
  booked: number
  medianFirstTouchMinutes: number | null
}

interface ClinicRow extends Funnel {
  clinicId: string
  name: string
}

interface Report {
  range: { days: number }
  scope: "clinic" | "all"
  clinic: { id: string; name: string }
  canSeeAllClinics: boolean
  funnel: Funnel
  sources: SourceRow[]
  icps: SourceRow[]
  cities: SourceRow[]
  team: TeamRow[]
  clinics?: ClinicRow[]
  unclaimed?: number
}

const selectClass =
  "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"

/** ₹1,23,456 — rupees, never paise, and never a decimal nobody reads. */
function rupees(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`
}

function percent(part: number, whole: number) {
  if (!whole) return "—"
  return `${Math.round((part / whole) * 100)}%`
}

/**
 * Lead to money, for one clinic.
 *
 * The lead count is the number that decides nothing — the columns to its
 * right are the ones worth spending against, so every table here carries the
 * same row all the way to revenue rather than stopping at "leads".
 */
function OverviewReport({ tabs }: { tabs: React.ReactNode }) {
  const [report, setReport] = useState<Report | null>(null)
  const [days, setDays] = useState(30)
  const [scope, setScope] = useState<"clinic" | "all">("clinic")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await fetch(`/api/reports?days=${days}&scope=${scope}`).then((r) => r.json())
    setReport(d?.funnel ? d : null)
    setLoading(false)
  }, [days, scope])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !report) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }
  if (!report) {
    return (
      <div className="space-y-5">
        <PageHeader title="Reports" />
        {tabs}
        <p className="rounded-md border border-border p-6 text-center text-sm">No numbers to show.</p>
      </div>
    )
  }

  const f = report.funnel
  const tiles = [
    { label: "Leads", value: f.leads, hint: "arrived in this period" },
    { label: "Worked", value: f.contacted, hint: `${percent(f.contacted, f.leads)} of leads` },
    { label: "Booked", value: f.booked, hint: `${percent(f.booked, f.leads)} of leads` },
    { label: "Attended", value: f.attended, hint: `${percent(f.attended, f.booked)} of bookings` },
    { label: "Patients", value: f.patients, hint: "bought a course" },
    { label: "Collected", value: rupees(f.revenueInPaise), hint: "paid in this period" },
  ]

  const table = (title: string, rows: SourceRow[], firstColumn: string) => (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Nothing in this period.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{firstColumn}</th>
                <th className="px-3 py-2 text-right font-medium">Leads</th>
                <th className="px-3 py-2 text-right font-medium">Booked</th>
                <th className="px-3 py-2 text-right font-medium">Attended</th>
                <th className="px-3 py-2 text-right font-medium">Earned from these leads</th>
                <th className="px-3 py-2 text-right font-medium">Lead → patient</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.leads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.booked}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.attended}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rupees(r.revenueInPaise)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {percent(r.attended, r.leads)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={
          <>
            {report.scope === "all" ? "Every clinic together" : report.clinic.name} · last {report.range.days} days.
            Bookings and visits are counted from appointments, and money from payments actually taken — never from
            what was prescribed. The tile counts money <b>paid in this period</b>; the tables count what this
            period&apos;s leads have paid <b>ever</b>, which is what says whether an ad set repaid its cost.
          </>
        }
        actions={
          <>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={selectClass}>
              {[7, 30, 90, 365].map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>
            {report.canSeeAllClinics && (
              <select value={scope} onChange={(e) => setScope(e.target.value as "clinic" | "all")} className={selectClass}>
                <option value="clinic">This clinic</option>
                <option value="all">All clinics</option>
              </select>
            )}
          </>
        }
      />

      {tabs}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className="mt-1 text-2xl font-medium tabular-nums">{t.value}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{t.hint}</div>
          </div>
        ))}
      </section>

      {f.unassigned > 0 && (
        <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {f.unassigned} lead{f.unassigned === 1 ? "" : "s"} in this period has nobody working it — check the
          routing rules in Setup → Lead routing.
        </p>
      )}

      {report.clinics && report.clinics.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Clinic by clinic</h2>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Clinic</th>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="px-3 py-2 text-right font-medium">Booked</th>
                  <th className="px-3 py-2 text-right font-medium">Attended</th>
                  <th className="px-3 py-2 text-right font-medium">Collected</th>
                  <th className="px-3 py-2 text-right font-medium">Not worked</th>
                </tr>
              </thead>
              <tbody>
                {report.clinics.map((c) => (
                  <tr key={c.clinicId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.leads}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.booked}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.attended}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupees(c.revenueInPaise)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {c.leads - c.contacted}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!report.unclaimed && (
            <p className="text-xs text-amber-700">
              {report.unclaimed} lead{report.unclaimed === 1 ? "" : "s"} belong to no clinic at all — they arrived
              before routing could place them.
            </p>
          )}
        </section>
      )}

      {table("Where the leads came from", report.sources, "Source")}
      {table("By ICP", report.icps, "ICP")}
      {table("By city", report.cities, "City")}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">The team</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Person</th>
                <th className="px-3 py-2 text-right font-medium">Leads</th>
                <th className="px-3 py-2 text-right font-medium">Worked</th>
                <th className="px-3 py-2 text-right font-medium">Booked</th>
                <th className="px-3 py-2 text-right font-medium">Typical first touch</th>
              </tr>
            </thead>
            <tbody>
              {report.team.map((t) => (
                <tr key={t.userId ?? "unassigned"} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{t.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.leads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.worked} <span className="text-muted-foreground">({percent(t.worked, t.leads)})</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.booked}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {t.medianFirstTouchMinutes === null
                      ? "—"
                      : t.medianFirstTouchMinutes < 90
                        ? `${t.medianFirstTouchMinutes} min`
                        : `${Math.round(t.medianFirstTouchMinutes / 60)} h`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          &quot;Typical first touch&quot; is the median time from a lead arriving to somebody moving it off New —
          the middle case, so one forgotten lead cannot flatter or ruin the figure.
        </p>
      </section>
    </div>
  )
}

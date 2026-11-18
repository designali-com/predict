"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CalendarCheck,
  Eye,
  ImageOff,
  IndianRupee,
  PhoneCall,
  SlidersHorizontal,
  TriangleAlert,
  Trophy,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { PredictSpinner } from "@/src/components/predict-loader"

/**
 * Which ads are worth the spend — leads, and how far those leads went.
 *
 * Leads alone flatter an ad whose people never pick up, so every row carries
 * the funnel: reached on the phone, booked, visited, paid. Each person counts
 * once, for the ad that brought them first (see api/lead-rules/ads).
 */

export interface AdPerformanceRow {
  provider: string
  adId: string | null
  adName: string | null
  adsetName: string | null
  campaignName: string | null
  formName: string | null
  submissions: number
  people: number
  reached: number
  booked: number
  visited: number
  patients: number
  junk: number
  revenueInPaise: number
  firstAt: string
  lastAt: string
  icp: string | null
  icpName: string | null
  /** Where to look at the ad — Meta ads only (see lib/meta-ad-links). */
  links?: {
    preview: string | null
    facebook: string | null
    instagram: string | null
    adsManager: string | null
    thumbnail: string | null
    status: string | null
  } | null
  /** What Meta says the ad cost and reached in the same window (spend in rupees). */
  spend?: {
    spend: number
    impressions: number
    reach: number
    clicks: number
    linkClicks: number
    metaLeads: number
  } | null
}

type GroupBy = "ad" | "adset" | "campaign" | "icp"
type SortKey = "people" | "reached" | "booked" | "visited" | "conversion" | "revenue" | "spend" | "cpl" | "roas" | "lastAt"

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "All time" },
] as const

const GROUPS: { key: GroupBy; label: string }[] = [
  { key: "ad", label: "Ad" },
  { key: "adset", label: "Ad set" },
  { key: "campaign", label: "Campaign" },
  { key: "icp", label: "ICP" },
]

const SORTS: { key: SortKey; label: string }[] = [
  { key: "people", label: "Leads" },
  { key: "reached", label: "Reached" },
  { key: "booked", label: "Booked" },
  { key: "visited", label: "Visited" },
  { key: "conversion", label: "Conversion" },
  { key: "revenue", label: "Revenue" },
  { key: "spend", label: "Spend" },
  { key: "cpl", label: "Cheapest lead" },
  { key: "roas", label: "Return on spend" },
  { key: "lastAt", label: "Latest lead" },
]

/** An ad needs this many leads before its conversion rate means anything. */
const MIN_LEADS_FOR_RATE = 10

interface Group {
  key: string
  title: string
  subtitle: string
  provider: string
  ads: AdPerformanceRow[]
  submissions: number
  people: number
  reached: number
  booked: number
  visited: number
  patients: number
  junk: number
  revenueInPaise: number
  /** Meta's spend over the same window, in paise; 0 with no spend data. */
  spendInPaise: number
  hasSpend: boolean
  impressions: number
  linkClicks: number
  metaLeads: number
  lastAt: string
  icp: string | null
  icpName: string | null
}

/** Spend per unit, or null when there is nothing to divide by. */
const per = (spendPaise: number, n: number) => (n > 0 && spendPaise > 0 ? spendPaise / n : null)
/** Revenue ÷ spend ("2.4×"), or null without spend. */
const roas = (revenuePaise: number, spendPaise: number) => (spendPaise > 0 ? revenuePaise / spendPaise : null)
const moneyOrDash = (paise: number | null) => (paise === null ? "—" : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`)
const roasText = (r: number | null) => (r === null ? "—" : `${r.toFixed(r < 10 ? 2 : 1)}×`)

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
const rupees = (paise: number) =>
  paise >= 10_000_000
    ? `₹${(paise / 10_000_000).toFixed(1)}L`
    : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${Math.max(1, m)}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d < 60 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function groupOf(ad: AdPerformanceRow, by: GroupBy): { key: string; title: string; subtitle: string } {
  const name = ad.adName ?? ad.formName ?? (ad.provider === "website" ? "Website form" : "Unnamed ad")
  if (by === "adset") return { key: `${ad.provider}:${ad.adsetName ?? "—"}`, title: ad.adsetName ?? "No ad set", subtitle: ad.campaignName ?? ad.provider }
  if (by === "campaign") return { key: `${ad.provider}:${ad.campaignName ?? "—"}`, title: ad.campaignName ?? (ad.provider === "website" ? "Website" : "No campaign"), subtitle: ad.provider }
  if (by === "icp") return { key: ad.icp ?? "—", title: ad.icpName ?? "No ICP (general messages)", subtitle: ad.icp ? `code ${ad.icp}` : "map these below" }
  return {
    key: `${ad.provider}:${ad.adId ?? ad.adName ?? ad.formName}`,
    title: name,
    subtitle: [ad.adsetName, ad.campaignName].filter(Boolean).join(" · ") || ad.formName || ad.provider,
  }
}

function build(ads: AdPerformanceRow[], by: GroupBy): Group[] {
  const map = new Map<string, Group>()
  for (const ad of ads) {
    const g = groupOf(ad, by)
    const cur =
      map.get(g.key) ??
      ({
        ...g,
        provider: ad.provider,
        ads: [],
        submissions: 0,
        people: 0,
        reached: 0,
        booked: 0,
        visited: 0,
        patients: 0,
        junk: 0,
        revenueInPaise: 0,
        spendInPaise: 0,
        hasSpend: false,
        impressions: 0,
        linkClicks: 0,
        metaLeads: 0,
        lastAt: ad.lastAt,
        icp: ad.icp,
        icpName: ad.icpName,
      } as Group)
    if (ad.spend) {
      cur.hasSpend = true
      cur.spendInPaise += Math.round(ad.spend.spend * 100)
      cur.impressions += ad.spend.impressions
      cur.linkClicks += ad.spend.linkClicks
      cur.metaLeads += ad.spend.metaLeads
    }
    cur.ads.push(ad)
    cur.submissions += ad.submissions
    cur.people += ad.people
    cur.reached += ad.reached
    cur.booked += ad.booked
    cur.visited += ad.visited
    cur.patients += ad.patients
    cur.junk += ad.junk
    cur.revenueInPaise += ad.revenueInPaise
    if (ad.lastAt > cur.lastAt) cur.lastAt = ad.lastAt
    if (cur.icp !== ad.icp) {
      cur.icp = cur.icp ?? ad.icp
      cur.icpName = cur.icpName ?? ad.icpName
    }
    map.set(g.key, cur)
  }
  return [...map.values()]
}

function sortValue(g: Group, key: SortKey): number | string {
  if (key === "conversion") return g.people >= MIN_LEADS_FOR_RATE ? g.visited / g.people : -1 + g.visited / Math.max(1, g.people)
  if (key === "revenue") return g.revenueInPaise
  if (key === "spend") return g.spendInPaise
  // Cheapest first: the lower the cost, the higher it sorts; no spend last.
  if (key === "cpl") {
    const c = per(g.spendInPaise, g.people)
    return c === null ? -Infinity : -c
  }
  if (key === "roas") return roas(g.revenueInPaise, g.spendInPaise) ?? -1
  if (key === "lastAt") return g.lastAt
  return g[key]
}

export function AdsPerformance({
  icps,
  onMap,
  reloadKey,
}: {
  icps: { interest: string | null; name: string }[]
  onMap: (ad: AdPerformanceRow, icpCode: string) => void
  /** Bumped by the page after a mapping is saved, to fetch again. */
  reloadKey?: number
}) {
  const [days, setDays] = useState<number>(30)
  const [by, setBy] = useState<GroupBy>("ad")
  const [sort, setSort] = useState<SortKey>("people")
  const [ads, setAds] = useState<AdPerformanceRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    fetch(`/api/lead-rules/ads${days ? `?days=${days}` : ""}`)
      .then((r) => r.json())
      .then((d) => live && setAds(d.ads ?? []))
      .catch(() => live && setAds([]))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [days, reloadKey])

  const groups = useMemo(() => {
    const list = build(ads ?? [], by)
    return list.sort((a, b) => {
      const x = sortValue(a, sort)
      const y = sortValue(b, sort)
      return x < y ? 1 : x > y ? -1 : b.people - a.people
    })
  }, [ads, by, sort])

  const total = useMemo(() => {
    const t = {
      people: 0,
      submissions: 0,
      reached: 0,
      booked: 0,
      visited: 0,
      patients: 0,
      junk: 0,
      revenue: 0,
      spend: 0,
      impressions: 0,
      linkClicks: 0,
      metaLeads: 0,
      // Our leads from the ads Meta gave spend for — so cost per lead divides like with like.
      spendPeople: 0,
    }
    for (const a of ads ?? []) {
      if (a.spend) {
        t.spend += Math.round(a.spend.spend * 100)
        t.impressions += a.spend.impressions
        t.linkClicks += a.spend.linkClicks
        t.metaLeads += a.spend.metaLeads
        t.spendPeople += a.people
      }
      t.people += a.people
      t.submissions += a.submissions
      t.reached += a.reached
      t.booked += a.booked
      t.visited += a.visited
      t.patients += a.patients
      t.junk += a.junk
      t.revenue += a.revenueInPaise
    }
    return t
  }, [ads])

  // The three cards: most leads, best conversion (with enough leads to mean
  // it), most revenue — over the grouping on screen.
  const top = useMemo(() => {
    const byLeads = [...groups].sort((a, b) => b.people - a.people)[0]
    const rated = groups.filter((g) => g.people >= MIN_LEADS_FOR_RATE && g.visited > 0)
    const byRate = [...rated].sort((a, b) => b.visited / b.people - a.visited / a.people)[0]
    const byRevenue = [...groups].filter((g) => g.revenueInPaise > 0).sort((a, b) => b.revenueInPaise - a.revenueInPaise)[0]
    const priced = groups.filter((g) => g.people >= MIN_LEADS_FOR_RATE && per(g.spendInPaise, g.people) !== null)
    const byCpl = [...priced].sort((a, b) => per(a.spendInPaise, a.people)! - per(b.spendInPaise, b.people)!)[0]
    const returning = groups.filter((g) => g.spendInPaise > 0 && g.revenueInPaise > 0)
    const byRoas = [...returning].sort((a, b) => roas(b.revenueInPaise, b.spendInPaise)! - roas(a.revenueInPaise, a.spendInPaise)!)[0]
    return { byLeads, byRate, byRevenue, byCpl, byRoas }
  }, [groups])

  const maxPeople = Math.max(1, ...groups.map((g) => g.people))
  const notCalled = total.people - total.reached

  return (
    <div className="space-y-4 p-4">
      {/* Controls: when, grouped how, ordered by what. */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented options={RANGES.map((r) => ({ key: String(r.days), label: r.label }))} value={String(days)} onChange={(v) => setDays(Number(v))} label="Period" />
        <Segmented options={GROUPS} value={by} onChange={(v) => setBy(v as GroupBy)} label="Group by" />
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          Sort by
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && !ads ? (
        <div className="flex justify-center py-12">
          <PredictSpinner />
        </div>
      ) : (ads ?? []).length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No leads from ads {days ? `in the last ${days} days` : "yet"}.
        </p>
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {/* The funnel, all ads together. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi icon={Users} label="Leads" value={total.people.toLocaleString("en-IN")} note={`${total.submissions.toLocaleString("en-IN")} form fills`} />
            <Kpi icon={PhoneCall} label="Reached" value={`${pct(total.reached, total.people)}%`} note={`${total.reached} called · ${notCalled.toLocaleString("en-IN")} not yet`} tone={pct(total.reached, total.people) < 25 ? "warn" : undefined} />
            <Kpi icon={CalendarCheck} label="Booked" value={total.booked.toLocaleString("en-IN")} note={`${pct(total.booked, total.people)}% of leads`} />
            <Kpi icon={UserCheck} label="Visited" value={total.visited.toLocaleString("en-IN")} note={`${pct(total.visited, total.booked)}% of booked`} />
            <Kpi icon={TrendingUp} label="Conversion" value={`${total.people ? ((total.visited / total.people) * 100).toFixed(1) : "0"}%`} note="lead → visit" />
            <Kpi icon={IndianRupee} label="Revenue" value={rupees(total.revenue)} note={`${total.patients} paying patients`} />
          </div>

          {/* The money: what the ads cost and what each step cost. */}
          {total.spend > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi icon={Wallet} label="Ad spend" value={rupees(total.spend)} note={`${total.impressions.toLocaleString("en-IN")} impressions`} />
              <Kpi
                icon={Users}
                label="Cost per lead"
                value={moneyOrDash(per(total.spend, total.spendPeople))}
                note={`${total.linkClicks.toLocaleString("en-IN")} link clicks`}
              />
              <Kpi icon={CalendarCheck} label="Cost per booking" value={moneyOrDash(per(total.spend, total.booked))} note={`${total.booked} booked`} />
              <Kpi icon={UserCheck} label="Cost per visit" value={moneyOrDash(per(total.spend, total.visited))} note={`${total.visited} visited`} />
              <Kpi icon={IndianRupee} label="Cost per patient" value={moneyOrDash(per(total.spend, total.patients))} note={`${total.patients} paid`} />
              <Kpi
                icon={TrendingUp}
                label="Return on spend"
                value={roasText(roas(total.revenue, total.spend))}
                note={`${rupees(total.revenue)} back on ${rupees(total.spend)}`}
                tone={(roas(total.revenue, total.spend) ?? 0) < 1 ? "warn" : "good"}
              />
            </div>
          ) : null}

          {total.metaLeads > 0 && total.metaLeads > total.submissions + 5 && (
            <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Meta counted <b>{total.metaLeads.toLocaleString("en-IN")}</b> leads from these ads; <b>{total.submissions.toLocaleString("en-IN")}</b>{" "}
                reached us. Over a long window part of the gap is leads from before Ops was connected; in a recent one it
                means forms that never arrived — worth checking the lead webhook.
              </span>
            </p>
          )}

          {/* Top performers over what is on screen. */}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <TopCard label="Most leads" group={top.byLeads} stat={top.byLeads ? `${top.byLeads.people} leads` : ""} />
            <TopCard
              label="Cheapest lead"
              group={top.byCpl}
              stat={top.byCpl ? `${moneyOrDash(per(top.byCpl.spendInPaise, top.byCpl.people))} per lead · ${top.byCpl.people} leads` : ""}
              empty="No spend data yet."
            />
            <TopCard
              label="Best conversion"
              group={top.byRate}
              stat={top.byRate ? `${((top.byRate.visited / top.byRate.people) * 100).toFixed(1)}% · ${top.byRate.visited} of ${top.byRate.people}` : ""}
              empty={`No ${by === "ad" ? "ad" : "group"} with ${MIN_LEADS_FOR_RATE}+ leads has a visit yet.`}
            />
            <TopCard label="Most revenue" group={top.byRevenue} stat={top.byRevenue ? rupees(top.byRevenue.revenueInPaise) : ""} empty="No revenue traced to an ad yet." />
            <TopCard
              label="Best return on spend"
              group={top.byRoas}
              stat={top.byRoas ? `${roasText(roas(top.byRoas.revenueInPaise, top.byRoas.spendInPaise))} · ${rupees(top.byRoas.revenueInPaise)} on ${rupees(top.byRoas.spendInPaise)}` : ""}
              empty="No ad has earned back revenue yet."
            />
          </div>

          {/* Every ad (or group), with its own funnel. */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[1240px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">{GROUPS.find((g) => g.key === by)?.label}</th>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="w-40 px-3 py-2 font-medium">Funnel</th>
                  <th className="px-3 py-2 text-right font-medium">Reached</th>
                  <th className="px-3 py-2 text-right font-medium">Booked</th>
                  <th className="px-3 py-2 text-right font-medium">Visited</th>
                  <th className="px-3 py-2 text-right font-medium">Conv.</th>
                  <th className="px-3 py-2 text-right font-medium">Revenue</th>
                  <th className="px-3 py-2 text-right font-medium">Spend</th>
                  <th className="px-3 py-2 text-right font-medium">Per lead</th>
                  <th className="px-3 py-2 text-right font-medium">Per visit</th>
                  <th className="px-3 py-2 text-right font-medium">Return</th>
                  <th className="px-3 py-2 font-medium">Latest</th>
                  {by === "ad" && <th className="px-3 py-2 font-medium">ICP</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map((g, i) => {
                  const conv = g.people ? (g.visited / g.people) * 100 : 0
                  const reachPct = pct(g.reached, g.people)
                  const ad = g.ads[0]!
                  return (
                    <tr key={g.key} className="align-top hover:bg-muted/30">
                      <td className="px-3 py-3 tabular-nums text-muted-foreground">
                        {i < 3 && sort === "people" ? <Trophy className={`h-4 w-4 ${["text-amber-500", "text-slate-400", "text-orange-700"][i]}`} aria-label={`Rank ${i + 1}`} /> : i + 1}
                      </td>
                      <td className="max-w-[340px] px-3 py-3">
                        <div className="flex items-start gap-2.5">
                          {by === "ad" && <AdThumb links={ad.links} title={g.title} />}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium" title={g.title}>
                                {g.title}
                              </span>
                              {by === "ad" && ad.links?.status && <StatusDot status={ad.links.status} />}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground" title={g.subtitle}>
                              {g.subtitle}
                              {by !== "ad" && ` · ${g.ads.length} ${g.ads.length === 1 ? "ad" : "ads"}`}
                            </div>
                            {by === "ad" && ad.links && <AdLinkRow links={ad.links} />}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="font-semibold tabular-nums">{g.people.toLocaleString("en-IN")}</div>
                        <div className="mt-1 ml-auto h-1 w-16 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${(g.people / maxPeople) * 100}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <FunnelBar g={g} />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className={g.people >= 20 && reachPct < 10 ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>{g.reached}</span>
                        <div className="text-[11px] text-muted-foreground">{reachPct}%</div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {g.booked}
                        <div className="text-[11px] text-muted-foreground">{pct(g.booked, g.people)}%</div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {g.visited}
                        <div className="text-[11px] text-muted-foreground">{pct(g.visited, g.booked)}% of booked</div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className={conv >= 5 ? "font-semibold text-emerald-700 dark:text-emerald-400" : ""}>{conv.toFixed(1)}%</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{g.revenueInPaise ? rupees(g.revenueInPaise) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {g.hasSpend ? rupees(g.spendInPaise) : <span className="text-muted-foreground">—</span>}
                        {g.hasSpend && g.impressions > 0 && (
                          <div className="text-[11px] text-muted-foreground">
                            CTR {((g.linkClicks / g.impressions) * 100).toFixed(2)}%
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {moneyOrDash(per(g.spendInPaise, g.people))}
                        {g.hasSpend && g.metaLeads > 0 && g.metaLeads !== g.submissions && (
                          <div className="text-[11px] text-muted-foreground" title="Leads Meta counted for this ad in the window">
                            Meta: {g.metaLeads}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{moneyOrDash(per(g.spendInPaise, g.visited))}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {(() => {
                          const r = roas(g.revenueInPaise, g.spendInPaise)
                          if (r === null) return <span className="text-muted-foreground">—</span>
                          return (
                            <span
                              className={
                                r >= 1
                                  ? "font-semibold text-emerald-700 dark:text-emerald-400"
                                  : r > 0
                                    ? "text-amber-700 dark:text-amber-400"
                                    : "text-muted-foreground"
                              }
                            >
                              {roasText(r)}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{ago(g.lastAt)}</td>
                      {by === "ad" && (
                        <td className="px-3 py-3">
                          {ad.icp ? (
                            <span className="inline-flex rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{ad.icpName}</span>
                          ) : icps.length && (ad.adId || ad.adName) ? (
                            <select
                              defaultValue=""
                              onChange={(e) => e.target.value && onMap(ad, e.target.value)}
                              aria-label={`Map ${g.title} to an ICP`}
                              className="h-7 rounded-md border border-amber-500/50 bg-background px-1.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <option value="">Map to ICP…</option>
                              {icps.map((r) => (
                                <option key={r.interest ?? r.name} value={r.interest ?? ""}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-amber-700 dark:text-amber-400">no ICP</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>Each person counts once, for the ad that brought them first.</span>
            <span className="inline-flex items-center gap-1">
              <LegendDot className="bg-primary/25" /> not reached
            </span>
            <span className="inline-flex items-center gap-1">
              <LegendDot className="bg-sky-500" /> reached
            </span>
            <span className="inline-flex items-center gap-1">
              <LegendDot className="bg-indigo-500" /> booked
            </span>
            <span className="inline-flex items-center gap-1">
              <LegendDot className="bg-emerald-500" /> visited
            </span>
            <span>Conversion = visited ÷ leads. Return = revenue ÷ spend (1× = the ad paid for itself).</span>
            <span>Spend, clicks and Meta&apos;s lead count come from Meta for the same period; revenue only counts what leads paid after arriving.</span>
          </p>
        </div>
      )}
    </div>
  )
}

/** Reached → booked → visited as one stacked bar, out of every lead. */
function FunnelBar({ g }: { g: Group }) {
  const total = Math.max(1, g.people)
  const visited = g.visited
  const booked = Math.max(0, g.booked - visited)
  const reached = Math.max(0, g.reached - g.booked)
  const seg = (n: number) => `${(n / total) * 100}%`
  return (
    <div className="space-y-1">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-primary/15" title={`${g.reached} reached · ${g.booked} booked · ${g.visited} visited of ${g.people}`}>
        <div className="h-full bg-emerald-500" style={{ width: seg(visited) }} />
        <div className="h-full bg-indigo-500" style={{ width: seg(booked) }} />
        <div className="h-full bg-sky-500" style={{ width: seg(reached) }} />
      </div>
      {g.people - g.reached > 0 && (
        <div className="text-[10px] text-muted-foreground">{(g.people - g.reached).toLocaleString("en-IN")} not called yet</div>
      )}
    </div>
  )
}

function LegendDot({ className }: { className: string }) {
  return <span className={`inline-block size-2 rounded-full ${className}`} />
}

function Kpi({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  note: string
  tone?: "warn" | "good"
}) {
  const frame =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-500/5"
      : tone === "good"
        ? "border-emerald-500/40 bg-emerald-500/5"
        : "border-border bg-card"
  return (
    <div className={`rounded-lg border px-3 py-3 ${frame}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums leading-tight">{value}</div>
      <div className={`mt-0.5 truncate text-[11px] ${tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{note}</div>
    </div>
  )
}

function TopCard({ label, group, stat, empty }: { label: string; group?: Group; stat: string; empty?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Trophy className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        {group ? (
          <>
            <div className="truncate text-sm font-semibold" title={group.title}>
              {group.title}
            </div>
            <div className="truncate text-xs text-muted-foreground">

              {stat}
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">{empty ?? "—"}</div>
        )}
      </div>
    </div>
  )
}

function Segmented({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { key: string; label: string }[]
  value: string
  onChange: (v: string) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <Button
          key={o.key}
          type="button"
          size="sm"
          variant={value === o.key ? "default" : "ghost"}
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className="h-7 px-2.5 text-xs"
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

type Links = NonNullable<AdPerformanceRow["links"]>

/** The ad's own picture, opening its preview. */
function AdThumb({ links, title }: { links?: Links | null; title: string }) {
  const href = links?.preview ?? links?.facebook ?? links?.instagram ?? null
  const img = links?.thumbnail ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={links.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-10 rounded-md object-cover" />
  ) : (
    <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <ImageOff className="h-4 w-4" />
    </span>
  )
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`View ${title}`}
      className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {img}
    </a>
  ) : (
    <span className="shrink-0">{img}</span>
  )
}

/** Live, paused or stopped — a word as well as a colour. */
function StatusDot({ status }: { status: string }) {
  const live = status === "ACTIVE"
  const paused = status.endsWith("PAUSED")
  const label = live ? "Live" : paused ? "Paused" : status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ")
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
        live ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"
      }`}
    >
      <span className={`size-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
      {label}
    </span>
  )
}

/** Preview · Facebook · Instagram · Ads Manager, each in a new tab. */
function AdLinkRow({ links }: { links: Links }) {
  const items: { href: string | null; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { href: links.preview, label: "Preview", icon: Eye },
    { href: links.facebook, label: "Facebook", icon: FacebookMark },
    { href: links.instagram, label: "Instagram", icon: InstagramMark },
    { href: links.adsManager, label: "Ads Manager", icon: SlidersHorizontal },
  ]
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {items
        .filter((i) => i.href)
        .map((i) => {
          const Icon = i.icon
          return (
            <a
              key={i.label}
              href={i.href!}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-3 w-3" /> {i.label}
            </a>
          )
        })}
    </div>
  )
}

function FacebookMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" />
    </svg>
  )
}

function InstagramMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

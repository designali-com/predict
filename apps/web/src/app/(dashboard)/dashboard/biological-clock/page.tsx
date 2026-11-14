"use client";

import React, { useEffect, useState } from "react";
import { PredictSpinner } from "@/src/components/predict-loader";
import Link from "next/link";
import { ArrowUpRight, FlaskConical, HeartPulse, Sparkles, TrendingUp } from "lucide-react";

import { RiskGauge } from "@/src/components/dashboard/user/risk-gauge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Progress } from "@workspace/ui/components/progress";
import {
  cleanName,
  formatValue,
  referenceRange,
  severityColor,
  type DashboardDomain,
  type PatientDashboard,
} from "@/src/components/dashboard/user/dashboard-data";

/**
 * The biological clock, in full, from the patient's own saved result.
 *
 * This page was entirely made up — "+7 years", a pace of "1.28 years per
 * year", seven domain scores and a "target biological age of 54.5" — none
 * of it from any patient. Now every number is from the calculation saved
 * against their chart: ages from the record and the latest panel, each
 * domain's share of the gap, and the markers actually out of range.
 *
 * Two things the old page claimed are gone rather than recomputed, because a
 * single blood panel cannot support them: a *pace* of ageing needs two panels
 * taken apart in time, and a "target" age is a promise nobody has calculated.
 */

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function DomainCard({ domain }: { domain: DashboardDomain }) {
  const color = severityColor(domain.severity);
  const share = Math.round((domain.shareOfDelta ?? 0) * 100);
  const name = cleanName(domain.name, domain.shortCode);

  return (
    <div className="flex flex-col justify-between rounded-2xl border bg-card p-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-bold text-muted-foreground">{domain.shortCode}</span>
          {domain.measured ? (
            <Badge
              variant="secondary"
              className="capitalize"
              style={{ color, backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` }}
            >
              {domain.band?.label ?? domain.severity}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Not measured
            </Badge>
          )}
        </div>
        <h5 className="mt-2 text-sm font-semibold">{name}</h5>
      </div>

      {domain.measured ? (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Share of your age gap</span>
            <span className="font-medium">{share}%</span>
          </div>
          <Progress value={share} className="h-1.5" />
          <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2 text-xs">
            <div>
              <span className="block text-muted-foreground">Mean |Z|</span>
              <span className="font-semibold">{(domain.meanAbsZ ?? 0).toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="block text-muted-foreground">Adds</span>
              <span className="font-bold">
                {(domain.contribution ?? 0) >= 0 ? "+" : "−"}
                {Math.abs(domain.contribution ?? 0).toFixed(1)} yrs
              </span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {domain.biomarkerCount} marker{domain.biomarkerCount === 1 ? "" : "s"} measured
            {domain.missing.length ? ` · ${domain.missing.length} not yet tested` : ""}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          None of its markers were on your report ({domain.missing.slice(0, 3).join(", ")}
          {domain.missing.length > 3 ? "…" : ""}), so it is left out of your biological age.
        </p>
      )}
    </div>
  );
}

export default function BiologicalClockPage() {
  const [data, setData] = useState<PatientDashboard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/patient/dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: PatientDashboard) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (!data && !failed) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-2rem)] items-center justify-center">
        <PredictSpinner />
      </div>
    );
  }
  if (failed || !data) {
    return (
      <p className="m-4 rounded-md border p-8 text-center text-sm text-muted-foreground">
        Couldn&apos;t load your results. Refresh the page, or contact the clinic if it keeps happening.
      </p>
    );
  }

  const index = data.indexes[0] ?? null;
  if (!index) {
    return (
      <div className="m-4 rounded-xl border border-dashed p-8 text-center md:m-8">
        <p className="text-sm font-medium">No biological age result yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          Your biological clock is calculated as soon as your clinic records a blood report against your chart.
        </p>
      </div>
    );
  }

  const years = Math.round(Math.abs(index.deltaAge));
  const older = index.deltaAge > 0;
  const gapLabel = years === 0 ? "Same as your age" : `${years} year${years === 1 ? "" : "s"} ${older ? "older" : "younger"}`;
  const gapTone = years === 0 ? "text-emerald-500" : older ? "text-amber-500" : "text-emerald-500";
  const ratio = index.chronologicalAge > 0 ? index.biologicalAge / index.chronologicalAge : 1;

  const measured = index.domains.filter((d) => d.measured);
  const byShare = [...measured].sort((a, b) => (b.shareOfDelta ?? 0) - (a.shareOfDelta ?? 0));
  const driver = byShare[0] ?? null;
  const second = byShare[1] ?? null;
  const calmest = byShare.length > 1 ? byShare[byShare.length - 1]! : null;
  const orderedDomains = [...byShare, ...index.domains.filter((d) => !d.measured)];

  // Worst first already; only the ones outside their range.
  const outOfRange = data.biomarkers.filter((b) => b.status === "High" || b.status === "Low");

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:gap-8 md:p-6">
      {/* 1. HEADER — the same heading as Biomarker Overview. */}
      <div className="max-w-3xl md:mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-medium tracking-tight md:text-2xl">Biological Clock</h1>
          <Badge
            variant="outline"
            className={older && years > 0 ? "border-amber-500/30 text-amber-500" : "border-emerald-500/30 text-emerald-500"}
          >
            {years === 0 ? "On pace with your age" : `${older ? "+" : "−"}${years} yrs ${older ? "older" : "younger"}`}
          </Badge>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          How old your body is by its blood markers, and which systems are behind that.
          {fmtDate(index.calculatedAt) ? ` Calculated ${fmtDate(index.calculatedAt)}` : ""}
          {data.lastPanelOn ? ` from your panel of ${fmtDate(data.lastPanelOn)}.` : "."}
        </p>
      </div>

      {/* 2. HERO */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-12">
        <Card className="flex flex-col items-center rounded-3xl p-4 md:p-6 lg:col-span-7">
          <CardHeader className="w-full px-0 pb-2 text-left">
            <CardTitle className="text-base font-semibold">Your clock</CardTitle>
            <CardDescription>
              Calculated from {index.measuredDomains} of {index.mappedDomains} body systems.
            </CardDescription>
          </CardHeader>
          {/* The clock itself smaller on a desktop, where at full width it
              was the tallest thing on the page by some way; the text and
              legend under it keep the card's width. */}
          <CardContent className="flex w-full max-w-xl flex-1 items-center justify-center px-0 pt-4">
            <RiskGauge index={index} clockClassName="lg:max-w-[400px]" />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 md:gap-6 lg:col-span-5">
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <Card className="rounded-2xl p-4">
              <span className="text-xs font-medium text-muted-foreground">Chronological age</span>
              <p className="mt-2 text-3xl font-bold">{Math.round(index.chronologicalAge)}</p>
              <span className="text-[11px] text-muted-foreground">From your record</span>
            </Card>
            <Card
              className={`rounded-2xl p-4 ${
                older && years > 0 ? "border-amber-500/20 bg-amber-500/5" : "border-emerald-500/20 bg-emerald-500/5"
              }`}
            >
              <span className={`text-xs font-medium ${gapTone}`}>Biological age</span>
              <p className={`mt-2 text-3xl font-bold ${gapTone}`}>{Math.round(index.biologicalAge)}</p>
              <span className={`text-[11px] ${gapTone}`}>{gapLabel}</span>
            </Card>
          </div>

          <Card className="rounded-3xl p-5 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Where your body stands
                </span>
                <h3 className="text-xl font-bold">Body {ratio.toFixed(1)}× your age</h3>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Your biological age is {index.biologicalAge.toFixed(1)} against {Math.round(index.chronologicalAge)}.
              {driver &&
                ` Most of the gap comes from ${cleanName(driver.name, driver.shortCode)} (${Math.round(
                  (driver.shareOfDelta ?? 0) * 100,
                )}%)${
                  second
                    ? `, then ${cleanName(second.name, second.shortCode)} (${Math.round((second.shareOfDelta ?? 0) * 100)}%)`
                    : ""
                }.`}
            </p>
            <p className="mt-3 rounded-xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
              This is where you stand today. How fast it is changing needs a second blood report, taken a few months
              from now.
            </p>
          </Card>

          <Card className="flex-1 rounded-3xl p-5 md:p-6">
            <h4 className="text-sm font-semibold">What each hand shows</h4>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3 border-b pb-3">
                <span className="font-medium">Hour hand · biological age</span>
                <span className="font-mono font-bold">
                  {index.biologicalAge.toFixed(2)} ({older ? "+" : "−"}
                  {years})
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b pb-3">
                <span className="font-medium">Minute hand · overall severity</span>
                <span className="font-mono font-bold">
                  {index.compositeScore.toFixed(2)}
                  {index.band ? ` · ${index.band.label}` : ""}
                </span>
              </div>
              {driver && (
                <div className="flex items-center justify-between gap-3 border-b pb-3">
                  <span className="font-medium">Second hand · main cause</span>
                  <span className="text-right font-bold" style={{ color: severityColor(driver.severity) }}>
                    {cleanName(driver.name, driver.shortCode)} ({driver.shortCode})
                  </span>
                </div>
              )}
              {calmest && (
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">Least affected system</span>
                  <span className="text-right font-bold" style={{ color: severityColor(calmest.severity) }}>
                    {cleanName(calmest.name, calmest.shortCode)} ({calmest.shortCode})
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* 3. DOMAINS */}
      <Card className="rounded-3xl p-4 md:p-6">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
            <div>
              <CardTitle className="text-lg">Age added by each body system</CardTitle>
              <CardDescription>
                How far each system&apos;s markers are from healthy, and how many years that adds.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit">
              {index.measuredDomains} of {index.mappedDomains} measured
            </Badge>
          </div>
        </CardHeader>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
          {orderedDomains.map((d) => (
            <DomainCard key={d.id} domain={d} />
          ))}
        </div>
      </Card>

      {/* 4. WHAT TO DO WITH IT */}
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <Card className="rounded-3xl p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-base font-semibold">Markers pushing your age up</h4>
              <p className="text-xs text-muted-foreground">Outside their healthy range on your latest report.</p>
            </div>
          </div>

          {outOfRange.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed p-4 text-xs text-muted-foreground">
              Every marker on your report is inside its range.
            </p>
          ) : (
            <div className="mt-5 space-y-2">
              {outOfRange.slice(0, 6).map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-2xl border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">
                      {b.shortCode} <span className="font-normal text-muted-foreground">· {b.name}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">Healthy range {referenceRange(b)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-bold">
                      {formatValue(b.value)}
                      {b.unit ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">{b.unit}</span> : null}
                    </p>
                    <span className={`text-[11px] font-semibold ${b.status === "High" ? "text-red-500" : "text-blue-500"}`}>
                      {b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="rounded-3xl p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-base font-semibold">Next steps</h4>
              <p className="text-xs text-muted-foreground">Bringing these markers back into range lowers the clock.</p>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {[
              {
                href: "/dashboard",
                title: "Your personalised plan",
                text: "Diet and supplements chosen for these results, on your dashboard.",
                icon: HeartPulse,
              },
              {
                href: "/dashboard/biomarker",
                title: "All your biomarkers",
                text: "Every marker from your report, by body system.",
                icon: FlaskConical,
              },
              {
                href: "/dashboard/ai",
                title: "Ask Predict AI",
                text: "Questions about your own results, answered from your report.",
                icon: Sparkles,
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-2xl border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <h5 className="text-xs font-bold">{item.title}</h5>
                    <p className="text-xs text-muted-foreground">{item.text}</p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { PredictSpinner } from "@/src/components/predict-loader";

import { BiomarkerCard } from "@workspace/ui/components/predict/biomarker-card";

import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bone,
  Brain,
  Droplets,
  HeartPulse,
  ShieldAlert,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";

import {
  cleanName,
  domainBlurb,
  formatValue,
  referenceRange,
  type DashboardBiomarker,
  type PatientDashboard,
} from "@/src/components/dashboard/user/dashboard-data";

/**
 * Every biomarker on the patient's latest report, grouped by the domains of
 * the index they are scored on.
 *
 * This page used to be a hard-coded list — hs-CRP 4.8, Myostatin, Substance P
 * — shown to every patient whatever their lab had run. It now reads the same
 * saved results as the dashboard: a domain nobody tested says so and lists
 * what it is missing, and a marker on the report that no domain claims still
 * appears, under "Other markers", rather than disappearing.
 */

/** An icon per domain; a domain added later without one gets its initials. */
const DOMAIN_ICON: Record<string, LucideIcon> = {
  IFR: ShieldAlert,
  VAF: Zap,
  MHF: Activity,
  BMF: Bone,
  PNF: Brain,
  CMF: HeartPulse,
  RFF: Droplets,
};

interface Section {
  key: string;
  code: string;
  title: string;
  description: string | null;
  markers: DashboardBiomarker[];
  missing: string[];
}

function DomainBadge({ code }: { code: string }) {
  const Icon = DOMAIN_ICON[code];
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary md:h-11 md:w-11">
      {Icon ? (
        <Icon className="h-5 w-5" />
      ) : (
        <span className="font-mono text-xs font-semibold">{code.slice(0, 3)}</span>
      )}
    </div>
  );
}

function BiomarkerSection({
  section,
  panelOn,
}: {
  section: Section;
  /** The report date already stated at the top — not repeated under each card. */
  panelOn: string | null;
}) {
  const measured = section.markers.length;
  return (
    <section className="scroll-mt-24">
      <div className="mb-5 flex items-start justify-between gap-4 md:mb-6">
        <div className="flex min-w-0 items-start gap-3 md:gap-4">
          <DomainBadge code={section.code} />
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight md:text-xl">
              {section.title}
              {section.code !== "OTHER" && (
                <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground md:text-sm">
                  ({section.code})
                </span>
              )}
            </h2>
            {section.description && (
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground md:text-sm">
                {section.description}
              </p>
            )}
            {/* On a phone the count sits under the title rather than
                beside it, where it squeezed the title into a narrow column. */}
            <p className="mt-1.5 text-[11px] font-medium text-muted-foreground md:hidden">
              {measured} measured
            </p>
          </div>
        </div>

        <Badge variant="secondary" className="hidden shrink-0 md:inline-flex">
          {measured} measured
        </Badge>
      </div>

      {measured === 0 ? (
        <div className="rounded-xl border border-dashed p-5">
          <p className="text-sm font-medium">Not measured yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            None of this domain&apos;s markers were on your report.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {section.markers.map((b) => (
            <div key={b.id} className="space-y-2">
              <BiomarkerCard
                name={b.shortCode}
                fullname={b.name}
                value={`${formatValue(b.value)}${b.unit ? ` ${b.unit}` : ""}`}
                status={b.status}
                referenceRange={referenceRange(b)}
              />
              {/* Only when this reading is from a different panel. */}
              {b.collectedOn && b.collectedOn !== panelOn && (
                <p className="px-1 text-xs text-muted-foreground">
                  From your panel of{" "}
                  {new Date(b.collectedOn).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {section.missing.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Not yet tested
          </span>
          {section.missing.map((code) => (
            <Badge key={code} variant="outline" className="rounded-full px-3 py-1 font-normal">
              {code}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

function StatCard({
  icon: Icon,
  tone,
  tag,
  value,
  label,
}: {
  icon: LucideIcon;
  tone: string;
  tag: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <Card className="rounded-2xl p-0">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center justify-between">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl md:h-10 md:w-10 ${tone}`}>
            <Icon className="h-4 w-4 md:h-5 md:w-5" />
          </div>
          {/* The coloured icon already says which is which; on a phone the
              tag only crowded a half-width card. */}
          <div className="hidden sm:block">{tag}</div>
        </div>
        <div className="mt-4 md:mt-5">
          <p className="text-2xl font-semibold md:text-3xl">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground md:text-sm">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BiomarkersPage() {
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

  const sections = useMemo<Section[]>(() => {
    if (!data) return [];
    const index = data.indexes[0];
    const inDomain = new Set<string>();

    const domainSections: Section[] = (index?.domains ?? []).map((d) => {
      d.biomarkers.forEach((b) => inDomain.add(b.id));
      return {
        key: d.id,
        code: d.shortCode,
        title: cleanName(d.name, d.shortCode),
        description: domainBlurb(d),
        markers: d.biomarkers,
        missing: d.missing,
      };
    });

    // On the report but in none of the index's domains — still shown.
    const others = data.biomarkers.filter((b) => !inDomain.has(b.id));
    if (others.length) {
      domainSections.push({
        key: "other",
        code: "OTHER",
        title: "Other markers",
        description: "On your report, but not part of any domain in your biological age.",
        markers: others,
        missing: [],
      });
    }
    return domainSections;
  }, [data]);

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
        Couldn&apos;t load your biomarkers. Refresh the page, or contact the clinic if it keeps happening.
      </p>
    );
  }

  const all = data.biomarkers;
  const highCount = all.filter((b) => b.status === "High").length;
  const lowCount = all.filter((b) => b.status === "Low").length;
  const normalCount = all.filter((b) => b.status === "Normal").length;

  return (
    <main className="bg-background">
      <div className="mx-auto w-full p-4 md:p-6">
        <div className="mb-8 max-w-3xl md:mb-10">
          <h1 className="text-xl font-medium tracking-tight md:text-2xl">Biomarker Overview</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Every marker from your latest blood report, grouped by the body system it tells you about.
            {data.lastPanelOn &&
              ` From your panel of ${new Date(data.lastPanelOn).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}.`}
          </p>
        </div>

        {all.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-sm font-medium">No blood report recorded yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Your biomarkers appear here once your clinic uploads your blood report.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-10 grid grid-cols-2 gap-3 md:mb-12 md:gap-4 lg:grid-cols-4">
              <StatCard
                icon={Activity}
                tone="bg-primary/10 text-primary"
                tag={<span className="text-xs text-muted-foreground">Total</span>}
                value={all.length}
                label="Biomarkers measured"
              />
              <StatCard
                icon={ArrowUp}
                tone="bg-red-500/10 text-red-500"
                tag={<Badge variant="destructive">Attention</Badge>}
                value={highCount}
                label="Above reference range"
              />
              <StatCard
                icon={ArrowDown}
                tone="bg-blue-500/10 text-blue-500"
                tag={<Badge variant="secondary">Review</Badge>}
                value={lowCount}
                label="Below reference range"
              />
              <StatCard
                icon={ShieldCheck}
                tone="bg-green-500/10 text-green-500"
                tag={<Badge variant="secondary">Stable</Badge>}
                value={normalCount}
                label="Within reference range"
              />
            </div>

            <Tabs defaultValue="all" className="w-full">
              <div className="mb-8 overflow-x-auto pb-2 md:mb-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <TabsList>
                  <TabsTrigger value="all" className="px-4 py-2 md:px-5">
                    All
                  </TabsTrigger>
                  {sections.map((s) => (
                    <TabsTrigger key={s.key} value={s.key} className="px-4 py-2 md:px-5">
                      {s.code === "OTHER" ? "Other" : s.code}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="all" className="space-y-14">
                {/* Measured domains first; the untested ones follow. */}
                {[...sections]
                  .sort((a, b) => Number(b.markers.length > 0) - Number(a.markers.length > 0))
                  .map((s) => (
                    <BiomarkerSection key={s.key} section={s} panelOn={data.lastPanelOn} />
                  ))}
              </TabsContent>

              {sections.map((s) => (
                <TabsContent key={s.key} value={s.key}>
                  <BiomarkerSection section={s} panelOn={data.lastPanelOn} />
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}
      </div>
    </main>
  );
}

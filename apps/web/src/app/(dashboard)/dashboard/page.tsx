"use client"

import { useEffect, useMemo, useState } from "react"
import { PredictSpinner } from "@/src/components/predict-loader"
import { AgeBar } from "@workspace/ui/components/predict/age-bar"
import { BiomarkerProfile } from "@/src/components/dashboard/user/biomarker"
import BodyAnatomy from "@/src/components/dashboard/user/body-anatomy"
import HealthInsightCard from "@/src/components/dashboard/user/health-insight-card"
import { RiskGauge } from "@/src/components/dashboard/user/risk-gauge"
import { HealthScore } from "@/src/components/dashboard/user/health-score"
import { DietProtocolCard } from "@/src/components/dashboard/user/diet-protocol-card"
import type { PatientDashboard } from "@/src/components/dashboard/user/dashboard-data"

/**
 * The patient's own numbers — and only their own numbers.
 *
 * Every figure on this page now comes from /api/patient/dashboard, which
 * reads the saved calculation rather than redoing it. Nothing renders a
 * placeholder: with no panel recorded the page says so, because a patient
 * has no way to tell a demo number from a result about their body.
 *
 * Which index a patient is scored on is decided in the clinic panel, on
 * their record — CBLAI until somebody chooses otherwise — and read by the
 * API, not here. A patient can have older results saved against other
 * indexes, and showing two biological ages would leave them to pick, with
 * nothing to pick on.
 */
export default function DashboardPage() {
  const [data, setData] = useState<PatientDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [activeDomain, setActiveDomain] = useState("")

  useEffect(() => {
    let live = true
    fetch("/api/patient/dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: PatientDashboard) => live && setData(d))
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  // The server decides which index a patient is scored on, so there is one
  // and there is nothing to choose between.
  const index = useMemo(() => data?.indexes[0] ?? null, [data])

  // Fall back to the domain driving the result rather than an empty panel.
  useEffect(() => {
    if (!index) return
    if (index.domains.some((d) => d.id === activeDomain)) return
    setActiveDomain(index.domains.find((d) => d.measured)?.id ?? index.domains[0]?.id ?? "")
  }, [index, activeDomain])

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-2rem)] items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  if (failed || !data) {
    return (
      <p className="m-4 rounded-md border p-8 text-center text-sm text-muted-foreground">
        Couldn&apos;t load your results. Refresh the page, or contact the clinic if it keeps
        happening.
      </p>
    )
  }

  const hasPanel = data.measured > 0

  return (
    <div className="space-y-4 p-4">
      {!hasPanel && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No blood panel recorded yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            Your biological age and domain breakdown appear here once your clinic records a lab
            report against your chart.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:flex">
        <AgeBar
          biologicalAge={index?.biologicalAge}
          chronologicalAge={index?.chronologicalAge}
        />
        <HealthScore
          biomarkers={data.biomarkers}
          inRange={data.inRange}
          measured={data.measured}
          lastPanelOn={data.lastPanelOn}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Anatomy Section */}
        <div className="col-span-12 rounded-xl border lg:col-span-8">
          <BodyAnatomy
            index={index}
            activeDomain={activeDomain}
            setActiveDomain={setActiveDomain}
          />
        </div>

        {/* Biological clock */}
        <div className="col-span-12 flex justify-center rounded-xl border p-4 lg:col-span-4">
          <RiskGauge index={index} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Biomarker Profile */}
        <div className="col-span-12 lg:col-span-4">
          <BiomarkerProfile biomarkers={data.biomarkers} />
        </div>

        {/* The selected domain, in full */}
        <div className="col-span-12 lg:col-span-8">
          <HealthInsightCard index={index} activeDomain={activeDomain} />
        </div>
      </div>

      {/* The nutritionist's plan, at the foot of the page — only once one is saved. */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          <DietProtocolCard />
        </div>
      </div>
    </div>
  )
}

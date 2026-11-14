"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Printer } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  DietProtocolSummary,
  DietProtocolView,
  type DietProtocolData,
} from "@workspace/ui/components/diet-protocol-view"
import { PredictSpinner } from "@/src/components/predict-loader"

/**
 * The patient's full dietary protocol, as their nutritionist wrote it — the
 * 7-day schedule, what to avoid, what to eat, portions and where to buy.
 * Printable: Print gives them the paper copy the clinic used to hand over.
 */
export default function DietPlanPage() {
  const [protocol, setProtocol] = useState<DietProtocolData | null | undefined>(undefined)

  useEffect(() => {
    fetch("/api/patient/diet-protocol")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setProtocol(d?.protocol ?? null))
      .catch(() => setProtocol(null))
  }, [])

  if (protocol === undefined) {
    return (
      <div className="flex min-h-[50svh] items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  if (!protocol) {
    return (
      <div className="m-4 rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm font-medium">No diet plan yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Your nutritionist writes your plan after your nutrition consultation. It will appear here.
        </p>
        <Link href="/dashboard" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-semibold">Your diet plan</h1>
        <Button size="sm" variant="outline" onClick={() => window.open("/diet-plan-print?print=1", "_blank")}>
          <Printer /> Print
        </Button>
      </div>
      <DietProtocolSummary protocol={protocol} />
      <DietProtocolView protocol={protocol} />
    </div>
  )
}

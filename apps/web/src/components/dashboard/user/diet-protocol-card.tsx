"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { DietProtocolSummary, type DietProtocolData } from "@workspace/ui/components/diet-protocol-view"

/**
 * The nutritionist's recommendation, as a card at the foot of the dashboard —
 * what was prescribed, the oils, what to cut out, and the way into the full
 * 7-day plan. Nothing at all until a nutritionist has saved one.
 */
export function DietProtocolCard() {
  const [protocol, setProtocol] = useState<DietProtocolData | null>(null)

  useEffect(() => {
    let live = true
    fetch("/api/patient/diet-protocol")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setProtocol(d?.protocol ?? null))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (!protocol) return null

  return (
    <DietProtocolSummary
      protocol={protocol}
      action={
        <Link
          href="/dashboard/diet-plan"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          View your 7-day diet plan <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
    />
  )
}

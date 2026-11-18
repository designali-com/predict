"use client"

import { useState } from "react"
import { PageHeader } from "@workspace/ui/components/page-header"
import { CarePlanCatalog } from "@/src/components/dashboard/care-plan-library/care-plan-catalog"
import { DietProtocolLibrary } from "@/src/components/dashboard/care-plan-library/diet-protocol-library"
import { ExerciseProtocolLibrary } from "@/src/components/dashboard/care-plan-library/exercise-protocol-library"
import { ValdTestSettings } from "@/src/components/dashboard/settings/vald-test-settings"

const TABS = [
  { value: "diet", label: "Diet protocols" },
  { value: "exercise", label: "Exercise" },
  // The DynaMo tests offered at the clinic — doctors add and edit them here.
  { value: "vald", label: "VALD tests" },
  { value: "items", label: "Care plan items" },
] as const

/**
 * What the nutritionist and doctors write once and assign many times: diet
 * protocols (copied onto a patient from their Nutrition tab) and the pick-list
 * of supplements and medications care plans choose from.
 */
export default function CarePlanLibraryPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("diet")

  return (
    <div className="flex w-full flex-col gap-4 p-4 lg:p-6">
      <PageHeader title="Care plan library" description="Write it once here, assign it to any patient from their record." />
      <div role="tablist" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "diet" ? (
        <DietProtocolLibrary />
      ) : tab === "exercise" ? (
        <ExerciseProtocolLibrary />
      ) : tab === "vald" ? (
        <ValdTestSettings />
      ) : (
        <CarePlanCatalog />
      )}
    </div>
  )
}

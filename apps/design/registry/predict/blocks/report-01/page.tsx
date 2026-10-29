"use client"

import { DownloadIcon, ShareIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  biomarkerCategoryLabels,
  biomarkerRange,
  getBiomarker,
  type BiomarkerCategory,
} from "@workspace/ui/lib/biomarkers"
import { flagValue, isConcern } from "@workspace/ui/lib/reference-range"
import { ReferenceRange } from "@workspace/ui/tools/reference-range"

// Example results, grouped the way the report reads.
const panel: Partial<Record<BiomarkerCategory, { id: string; value: number }[]>> = {
  inflammation: [
    { id: "hs-crp", value: 3.5 },
    { id: "nlr", value: 3.2 },
    { id: "il-6", value: 9.8 },
    { id: "tnf-alpha", value: 4.1 },
  ],
  lipids: [
    { id: "total-cholesterol", value: 225.6 },
    { id: "ldl-c", value: 185.5 },
    { id: "hdl-c", value: 35.7 },
    { id: "triglycerides", value: 120 },
  ],
  metabolic: [
    { id: "fbs", value: 94 },
    { id: "fsi", value: 11 },
    { id: "hba1c", value: 7.6 },
  ],
  kidney: [
    { id: "egfr", value: 82.7 },
    { id: "creatinine", value: 1.8 },
    { id: "bun", value: 21.8 },
    { id: "albumin", value: 4.3 },
  ],
}

const groups = Object.keys(panel) as BiomarkerCategory[]

const all = groups.flatMap((group) => panel[group]!)
// Only count results on the side the direction marks as bad.
const outOfRange = all.filter(({ id, value }) => {
  const range = biomarkerRange(getBiomarker(id)!)
  return isConcern(flagValue(value, range), range.direction)
}).length

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-medium tracking-tight">Biomarker report</h1>
            <Badge variant="outline">October panel</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Priya Sharma · Collected 12 Oct 2026 · Fasting 10 hours
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <ShareIcon data-icon="inline-start" />
            Share
          </Button>
          <Button size="sm">
            <DownloadIcon data-icon="inline-start" />
            Download PDF
          </Button>
        </div>
      </header>

      <dl className="grid grid-cols-3 rounded-lg border">
        {[
          { label: "Biomarkers", value: all.length },
          { label: "In range", value: all.length - outOfRange },
          { label: "Needs attention", value: outOfRange },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 p-4 not-first:border-l">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="text-2xl font-medium tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <Separator />

      <Tabs defaultValue={groups[0]}>
        <TabsList className="max-w-full overflow-x-auto">
          {groups.map((group) => (
            <TabsTrigger key={group} value={group}>
              {biomarkerCategoryLabels[group]}
            </TabsTrigger>
          ))}
        </TabsList>
        {groups.map((group) => (
          <TabsContent key={group} value={group} className="pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {panel[group]!.map(({ id, value }) => {
                const biomarker = getBiomarker(id)!
                return (
                  <ReferenceRange
                    key={id}
                    name={biomarker.abbreviation}
                    description={biomarker.name}
                    value={value}
                    unit={biomarker.unit}
                    range={biomarkerRange(biomarker)}
                    className="max-w-none"
                  />
                )
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <p className="text-xs text-muted-foreground">
        General information, not medical advice. Discuss your results with a clinician.
      </p>
    </div>
  )
}

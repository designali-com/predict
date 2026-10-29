"use client"

import { InfoIcon } from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

// The CBMI worked example. Each domain's Mean |Z| comes from its biomarker
// Z-scores, Wd is its share of the total, and αd is its priority.
// Score = αd × Mean |Z| × Wd.
const domains = [
  {
    name: "Cardiometabolic Risk",
    abbr: "CMR",
    alpha: 6,
    biomarkers: [
      { name: "HbA1c", z: 7 },
      { name: "TC", z: 3.338 },
      { name: "LDL-C", z: 9.024 },
      { name: "HDL-C", z: -2.43 },
    ],
  },
  {
    name: "Inflammatory Risk",
    abbr: "IR",
    alpha: 2,
    biomarkers: [
      { name: "hs-CRP", z: 2.714 },
      { name: "NLR", z: 2.4 },
      { name: "IL-6", z: 3.712 },
    ],
  },
  {
    name: "Muscle-Cartilage Degeneration Risk",
    abbr: "MCDR",
    alpha: 2,
    biomarkers: [
      { name: "CK-MM", z: 2.667 },
      { name: "Aldolase A", z: 2.627 },
      { name: "IGF-1", z: -2.107 },
      { name: "Myostatin", z: 4.52 },
      { name: "CTX-II", z: 2.736 },
    ],
  },
  {
    name: "Bone Turnover Risk",
    abbr: "BTR",
    alpha: 1,
    biomarkers: [
      { name: "PTH", z: 2.824 },
      { name: "Ca/P ratio", z: 2.5 },
      { name: "Vitamin D", z: -2.263 },
      { name: "Osteocalcin", z: -2.263 },
      { name: "PINP", z: -2.687 },
    ],
  },
  {
    name: "Neurovascular Function Risk",
    abbr: "NVFR",
    alpha: 1,
    biomarkers: [
      { name: "BDNF", z: -2.352 },
      { name: "VEGF", z: 3.011 },
      { name: "NOx", z: -2.11 },
    ],
  },
]

const withMeanZ = domains.map((d) => ({
  ...d,
  meanZ: d.biomarkers.reduce((sum, b) => sum + Math.abs(b.z), 0) / d.biomarkers.length,
}))
const totalMeanZ = withMeanZ.reduce((sum, d) => sum + d.meanZ, 0)
const scored = withMeanZ.map((d) => {
  const weight = d.meanZ / totalMeanZ
  return { ...d, weight, score: d.alpha * d.meanZ * weight }
})
const total = scored.reduce((sum, d) => sum + d.score, 0)
const maxScore = Math.max(...scored.map((d) => d.score))

export default function Page() {
  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Composite Biological Musculoskeletal Index</CardTitle>
            <CardDescription>Five domains, 21 biomarkers.</CardDescription>
            <CardAction>
              <Tooltip>
                <TooltipTrigger
                  aria-label="How the score works"
                  className="text-muted-foreground"
                >
                  <InfoIcon className="size-4" />
                </TooltipTrigger>
                <TooltipContent className="max-w-60">
                  Each domain scores αd × Mean |Z| × Wd. The index is their sum.
                </TooltipContent>
              </Tooltip>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex items-end gap-3">
              <span className="text-5xl font-medium tracking-tight tabular-nums">
                {total.toFixed(2)}
              </span>
              <Badge variant="destructive" className="mb-2">
                CBMI
              </Badge>
            </div>

            <ul className="flex flex-col gap-3">
              {scored.map((d) => (
                <li key={d.abbr} className="grid grid-cols-[3.5rem_1fr_3rem] items-center gap-3">
                  <span className="text-xs font-medium">{d.abbr}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(d.score / maxScore) * 100}%` }}
                    />
                  </div>
                  <span className="text-right text-xs tabular-nums">{d.score.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Domains</CardTitle>
            <CardDescription>Open a domain to see its biomarker Z-scores.</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion defaultValue={["CMR"]}>
              {scored.map((d) => (
                <AccordionItem key={d.abbr} value={d.abbr}>
                  <AccordionTrigger>
                    <span className="flex flex-1 items-center justify-between gap-4 pr-2">
                      <span>
                        {d.name} <span className="text-muted-foreground">({d.abbr})</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        αd {d.alpha} · Wd {d.weight.toFixed(2)}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="py-1 text-left font-normal">Biomarker</th>
                          <th className="py-1 text-right font-normal">Z</th>
                          <th className="py-1 text-right font-normal">|Z|</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        {d.biomarkers.map((b) => (
                          <tr key={b.name} className="border-t">
                            <td className="py-1.5">{b.name}</td>
                            <td className="py-1.5 text-right">{b.z.toFixed(2)}</td>
                            <td className="py-1.5 text-right">{Math.abs(b.z).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}

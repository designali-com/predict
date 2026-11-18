"use client"

import React from "react"

import { CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { BiomarkerCard } from "@workspace/ui/components/predict/biomarker-card"
import {
  Gauge,
  GaugeIndicator,
  GaugeLabel,
  GaugeRange,
  GaugeTrack,
  GaugeValueText,
} from "@workspace/ui/components/gauge"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { PersonalizedPlanPanel } from "./personalized-plan-panel"
import { DottedScroll } from "./dotted-scroll"

import {
  cleanName,
  domainBlurb,
  findDomain,
  formatValue,
  referenceRange,
  severityColor,
  type DashboardIndex,
} from "./dashboard-data"

interface HealthInsightCardProps {
  index: DashboardIndex | null
  activeDomain: string
}

/**
 * What one domain is made of, for the domain the patient has selected.
 *
 * The version this replaces carried a physician note, a percentile, a
 * supplement list and a seven-day meal plan — none of which exist anywhere in
 * the database, and all of which read as medical advice written for this
 * patient. Invented advice is a different order of problem from an invented
 * chart, so it is gone rather than restyled. The plan panel keeps its place
 * and says plainly that nothing has been published.
 *
 * What is left is what the clinic actually recorded: the domain's own
 * contribution to the biological age gap, the markers it was scored on with
 * the ranges they were judged against, and an explicit list of what is still
 * untested.
 */
export default function HealthInsightCard({ index, activeDomain }: HealthInsightCardProps) {
  const domain = findDomain(index, activeDomain)

  // Which marker the slider is showing. Read off the scroll position rather
  // than assumed: a counter that says "1 of 5" after the patient has swiped
  // to the fifth is worse than no counter.
  const [current, setCurrent] = React.useState(0)

  React.useEffect(() => {
    setCurrent(0)
  }, [domain?.id])

  if (!index || !domain) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border p-8">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Select a domain once your biological age has been calculated.
        </p>
      </div>
    )
  }

  const share = Math.round((domain.shareOfDelta ?? 0) * 100)
  const name = cleanName(domain.name, domain.shortCode)
  const markers = domain.biomarkers

  return (
    <div className="grid h-full rounded-xl border lg:grid-cols-2">
      {/* LEFT — THE DOMAIN, AND THE MARKERS BEHIND IT */}
      <div className="flex min-w-0 flex-col gap-6 p-6 lg:p-8">
        <CardHeader className="p-0">
          <CardTitle className="text-xl">{name}</CardTitle>
          <CardDescription className="max-w-lg leading-relaxed">
            {domainBlurb(domain) ?? "No description has been set for this domain."}
          </CardDescription>
        </CardHeader>

        <Separator />

        {/* Gauge above the working on a phone, beside it from sm up — at
            360px wide the two side by side leave the text a column about four
            characters across. */}
        {domain.measured ? (
          <div className="flex h-fit w-full flex-col items-center gap-5 sm:w-fit sm:flex-row sm:items-start">
            <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
              <Gauge key={domain.id} value={share} max={100} size={150} thickness={40}>
                <GaugeIndicator>
                  <GaugeTrack />
                  <GaugeRange />
                </GaugeIndicator>
                <GaugeValueText />
                <GaugeLabel className="sr-only">
                  {name} share of the biological age gap
                </GaugeLabel>
              </Gauge>
            </div>

            {/* Full width on a phone so the explanation stays left-aligned
                under the centred gauge rather than shrinking to its middle. */}
            <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto">
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>
                  {share}% of your biological age gap
                </span>
                <span className="h-3 w-px bg-border" />
                <span className="font-medium" style={{ color: severityColor(domain.severity) }}>
                  {domain.band?.label ?? domain.severity}
                </span>
              </div>

              <h3 className="font-medium">How this was worked out</h3>

              <p className="text-xs leading-relaxed text-muted-foreground">
                {domain.biomarkerCount} marker
                {domain.biomarkerCount === 1 ? "" : "s"} measured, averaging{" "}
                {formatValue(domain.meanAbsZ ?? 0)} standard deviations from mid-range. Weighted
                at {((domain.weightUsed ?? 0) * 100).toFixed(1)}% with severity factor{" "}
                {domain.alphaUsed}, that adds{" "}
                <span className="font-medium text-foreground">
                  {(domain.contribution ?? 0).toFixed(1)} years
                </span>{" "}
                to your biological age.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6">
            <p className="text-sm font-medium">Not measured</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              None of this domain&apos;s markers have been tested, so it was left out of the
              calculation entirely — it is not counted as zero.
            </p>
          </div>
        )}

        {domain.missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Not yet tested
            </span>
            {domain.missing.map((code) => (
              <Badge key={code} variant="outline" className="rounded-full px-3 py-1 font-normal">
                {code}
              </Badge>
            ))}
          </div>
        )}

        {/* YOUR MARKERS — one card, slid sideways for the rest */}
        <div className="mt-auto flex min-w-0 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Your markers</h3>
            {markers.length > 1 && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {Math.min(current + 1, markers.length)} of {markers.length} · slide for the rest
              </span>
            )}
          </div>

          {markers.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-4 text-xs text-muted-foreground">
              Nothing from your report falls into this domain yet.
            </p>
          ) : (
            /*
              One marker at a time, on every screen size. A domain can hold
              six; six cards stacked push the gauge and the working off the
              screen on the way past, and a column that long is the reason
              this panel stopped fitting beside the plan.

              The card is a little under full width so the next one shows at
              the edge — without that sliver there is nothing to tell anyone
              the list continues.
            */
            <DottedScroll
              axis="x"
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-4"
              onScroll={(e) => {
                const track = e.currentTarget
                const card = track.firstElementChild as HTMLElement | null
                if (!card) return
                // Card width plus the gap-3 between them.
                const step = card.offsetWidth + 12
                const at = Math.round(track.scrollLeft / step)
                setCurrent(Math.max(0, Math.min(at, markers.length - 1)))
              }}
            >
              {markers.map((b) => (
                <div
                  key={b.id}
                  className="w-[calc(100%-1.75rem)] shrink-0 snap-start"
                >
                  <BiomarkerCard
                    name={b.shortCode}
                    fullname={b.name}
                    value={`${formatValue(b.value)}${b.unit ? ` ${b.unit}` : ""}`}
                    status={b.status}
                    referenceRange={referenceRange(b)}
                  />
                </div>
              ))}
            </DottedScroll>
          )}
        </div>
      </div>

      {/* RIGHT — PERSONALIZED PLAN
          On a desktop the plan scrolls inside its own column, so its length
          no longer sets the height of the whole row — the domain on the left
          does. Pinned to the cell with absolute positioning because a grid
          row otherwise grows to its tallest child. On a phone it is simply
          as long as it is. */}
      <div className="border-t lg:relative lg:min-h-[560px] lg:border-l lg:border-t-0">
        <div className="flex flex-col lg:absolute lg:inset-0">
          <div className="px-6 pt-6 lg:px-8 lg:pt-8">
            <h2 className="text-xl font-medium">Personalized Plan</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Advice for your <span className="font-medium text-foreground">{name}</span> comes first.
            </p>
          </div>

          <DottedScroll
            wrapperClassName="flex min-h-0 flex-1 flex-col"
            className="flex flex-1 flex-col gap-6 p-6 lg:min-h-0 lg:overflow-y-auto lg:p-8 lg:pr-10"
          >
            <PersonalizedPlanPanel domainCode={domain.shortCode} />
          </DottedScroll>
        </div>
      </div>
    </div>
  )
}

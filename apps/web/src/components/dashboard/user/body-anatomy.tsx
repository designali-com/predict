"use client"
import { Button } from "@workspace/ui/components/button"

import React from "react"
import Image from "next/image"
import { Badge } from "@workspace/ui/components/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import {
  DOMAIN_POSITION,
  UNMEASURED_COLOR,
  cleanName,
  domainBlurb,
  formatValue,
  severityColor,
  type DashboardDomain,
  type DashboardIndex,
} from "./dashboard-data"

interface BodyAnatomyProps {
  index: DashboardIndex | null
  activeDomain?: string
  setActiveDomain?: React.Dispatch<React.SetStateAction<string>> | ((id: string) => void)
}

/**
 * The domains of one index, placed on the body.
 *
 * Every domain, score and marker list here came out of the saved result. The
 * seven hard-coded ones this replaced were not this patient's — and three of
 * them are not even mapped to the index they were being drawn for.
 *
 * Unmeasured domains keep their place in the list but get no dot and no
 * colour: a grey "not measured" row is information ("nobody ran these
 * markers"), a green dot in the same place would be a lie.
 */
export default function BodyAnatomy({
  index,
  activeDomain: externalActiveDomain,
  setActiveDomain: externalSetActiveDomain,
}: BodyAnatomyProps) {
  const domains = index?.domains ?? []
  const fallback = domains.find((d) => d.measured)?.id ?? domains[0]?.id ?? ""

  const [internalActiveDomain, setInternalActiveDomain] = React.useState<string>(fallback)
  const activeDomain = externalActiveDomain ?? internalActiveDomain
  const setActiveDomain = externalSetActiveDomain ?? setInternalActiveDomain

  const pinned = domains.filter((d) => d.measured && DOMAIN_POSITION[d.shortCode])

  const dotColor = (d: DashboardDomain) =>
    d.measured ? severityColor(d.severity) : UNMEASURED_COLOR

  if (!index) {
    return (
      <div className="flex min-h-[300px] w-full items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          Your domain breakdown appears here once a blood panel has been recorded and your
          biological age calculated.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      {/* On a phone the list and the body stack: floated over a body that
          narrow, the list covered it and ran off the bottom of a card with a
          fixed height. From md up the list floats over the body again. */}
      <div className="relative flex w-full flex-col overflow-hidden rounded-xl md:min-h-[500px] md:flex-row">
        {/* Left Side: Floating Accordion Selection */}
        <div className="relative z-20 flex w-full flex-col gap-6 p-4 md:pointer-events-none md:absolute md:left-0 md:top-0 md:h-full md:max-w-lg md:p-6">
          <div className="pointer-events-auto flex flex-col items-start gap-3">
            {/* base-ui takes an array even when only one item may be open —
                the `type`/`collapsible` pair this used to pass is Radix's API
                and was landing on the DOM node. */}
            <Accordion
              multiple={false}
              value={[activeDomain]}
              onValueChange={(val) => {
                const next = val[0]
                if (typeof next === "string" && next) setActiveDomain(next)
              }}
              className="w-full space-y-2 border-none"
            >
              {domains.map((domain) => (
                <AccordionItem
                  key={domain.id}
                  value={domain.id}
                  className="w-full rounded-[24px] border bg-background/80 backdrop-blur-md transition-all md:w-fit"
                  onClick={() => setActiveDomain(domain.id)}
                >
                  <AccordionTrigger className="group flex w-full items-center px-4 py-3 text-lg font-semibold hover:no-underline md:w-fit">
                    <div className="flex items-center gap-3 text-left">
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: dotColor(domain),
                          boxShadow: domain.measured
                            ? `0 0 10px ${dotColor(domain)}`
                            : undefined,
                          opacity: domain.measured ? 1 : 0.4,
                        }}
                      />
                      <span
                        className={`text-sm font-medium ${
                          domain.measured ? "" : "text-muted-foreground"
                        }`}
                      >
                        {cleanName(domain.name, domain.shortCode)}
                        <span className="ml-1 font-mono opacity-60">({domain.shortCode})</span>
                      </span>
                      {!domain.measured && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          not measured
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="border-t border-border/40 px-4 pb-4 pt-3">
                    <p className="mb-3 text-xs leading-relaxed text-muted-foreground md:text-sm">
                      {domainBlurb(domain) ?? "No description set for this domain."}
                    </p>

                    {domain.measured ? (
                      <p className="mb-3 text-xs text-muted-foreground">
                        Mean |Z| {formatValue(domain.meanAbsZ ?? 0)} from {domain.biomarkerCount}{" "}
                        marker{domain.biomarkerCount === 1 ? "" : "s"} ·{" "}
                        {Math.round((domain.shareOfDelta ?? 0) * 100)}% of your biological
                        age gap
                        {domain.band ? ` · ${domain.band.label}` : ""}
                      </p>
                    ) : (
                      <p className="mb-3 text-xs text-muted-foreground">
                        Not included in your result — none of its markers have been tested.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {domain.biomarkers.map((b) => (
                        <Badge
                          key={b.id}
                          variant="secondary"
                          className="px-2.5 py-0.5 text-[11px] font-semibold tracking-wide"
                        >
                          {b.shortCode}
                        </Badge>
                      ))}
                      {domain.missing.map((code) => (
                        <Badge
                          key={code}
                          variant="outline"
                          className="px-2.5 py-0.5 text-[11px] font-normal tracking-wide text-muted-foreground"
                        >
                          {code}
                        </Badge>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>

        {/* Anchored to the bottom so the figure stands on the card's edge —
            on a phone it is centred under the list and as tall as the card
            is wide allows. */}
        <div className="relative z-10 flex w-full items-end justify-center md:-mb-10 md:ml-auto md:min-h-[500px] md:items-center md:justify-end">
          <div className="relative aspect-[1290/1818] h-[470px] max-w-full sm:h-[560px] md:h-[650px]">
            <Image
              src="/anatomy.png"
              alt="Body anatomy"
              fill
              sizes="(max-width: 768px) 100vw, 460px"
              className="object-contain object-bottom"
              priority={false}
            />

            {pinned.map((domain) => {
              const isActive = domain.id === activeDomain
              const color = dotColor(domain)
              const position = DOMAIN_POSITION[domain.shortCode]!
              return (
                <Button variant="ghost" size="default"
 key={domain.id}
 type="button"
 onClick={() => setActiveDomain(domain.id)}
 className="absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center focus:outline-none h-auto whitespace-normal"
 style={{ left: `${position.x}%`, top: `${position.y}%` }}
 aria-label={`${cleanName(domain.name, domain.shortCode)} — ${domain.severity ?? "not measured"}`}
 >
                  {/* No solid dot — only a ring that keeps widening outward
                      from the spot, in the domain's colour. The selected
                      domain also glows, so the one the card is about stands
                      out without a blob sitting on the organ. */}
                  {isActive && (
                    <span
                      className="absolute -z-10 rounded-full blur-xl"
                      style={{
                        width: "6rem",
                        height: "6rem",
                        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
                        opacity: 0.9,
                      }}
                    />
                  )}
                  <span className={`relative flex ${isActive ? "h-7 w-7" : "h-5 w-5"}`}>
                    {[0, 0.9].map((delay) => (
                      <span
                        key={delay}
                        className="absolute inset-0 animate-ring-out rounded-full border-2"
                        // The selected ring is white with a glow of its
                        // colour: orange on the orange heart vanished.
                        style={{
                          borderColor: isActive ? "rgba(255,255,255,0.95)" : color,
                          animationDelay: `${delay}s`,
                          boxShadow: isActive ? `0 0 12px 2px ${color}, inset 0 0 8px ${color}` : undefined,
                        }}
                      />
                    ))}
                  </span>
                </Button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

import * as React from "react"
import { Check, ExternalLink, ShoppingBasket, Stethoscope, X } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * The nutritionist's dietary protocol, read-only — the same page in the clinic
 * (above its editor) and on the patient's dashboard, so the patient reads
 * exactly what was written for them.
 *
 * The shape mirrors DietProtocol in @workspace/db/diet-protocol. Restated here
 * because the UI package does not depend on the database package; a field
 * added there and not here fails to type-check where the two meet.
 */
export interface DietProtocolData {
  diet?: string | null
  title: string
  badge: string
  cookingOils: string
  excludedSummary: string
  note: string
  meals: { label: string; days: string[] }[]
  remarks: string[]
  avoid: string[]
  vegetables: string[]
  fruits: string[]
  portions: { measure: string; value: string }[]
  grocery: string[]
  links: { name: string; url: string; store: string }[]
  physicianConstraints: string
  updated?: { byName: string; at: string }
}

/** The short card: what was prescribed, the oils, what is cut out. */
export function DietProtocolSummary({
  protocol,
  action,
  className,
}: {
  protocol: DietProtocolData
  /** A link or button at the foot — "View full plan". */
  action?: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
        <Stethoscope className="h-3.5 w-3.5" /> Nutritionist recommendation
      </p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Prescribed protocol: <span className="text-foreground">{protocol.title}</span>
      </p>
      <ul className="mt-2 space-y-1 leading-snug">
        {protocol.cookingOils && (
          <li>
            • <b>Cooking oils:</b> Strictly {protocol.cookingOils}.
          </li>
        )}
        {protocol.excludedSummary && (
          <li>
            • <b>Excluded:</b> {protocol.excludedSummary}.
          </li>
        )}
        {protocol.note && <li>• {protocol.note}</li>}
      </ul>
      {action && <div className="mt-3">{action}</div>}
    </section>
  )
}

function Chips({ items, tone }: { items: string[]; tone: "bad" | "good" }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">—</p>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <li
          key={i}
          className={cn(
            "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
            tone === "bad"
              ? "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300"
              : "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300",
          )}
        >
          {tone === "bad" ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          {item}
        </li>
      ))}
    </ul>
  )
}

function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border p-4 print:break-inside-avoid", className)}>
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** The whole protocol, in the order it is handed over. */
export function DietProtocolView({ protocol, className }: { protocol: DietProtocolData; className?: string }) {
  const days = protocol.meals[0]?.days.length ?? 7
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Title block */}
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-muted/30 p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Patient dietary protocol
          </p>
          <h2 className="mt-1 text-xl font-semibold">{protocol.title}</h2>
          {protocol.badge && (
            <span className="mt-2 inline-block rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {protocol.badge}
            </span>
          )}
        </div>
        <span className="text-lg font-bold tracking-widest text-muted-foreground">Predict</span>
      </header>

      {/* 7-day schedule */}
      {protocol.meals.length > 0 && (
        <section className="overflow-hidden rounded-xl border print:break-inside-avoid">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-xs">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="sticky left-0 w-40 bg-muted px-3 py-2 font-semibold">Meals</th>
                  {Array.from({ length: days }, (_, i) => (
                    <th key={i} className="px-3 py-2 font-semibold">
                      Day {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {protocol.meals.map((meal, r) => (
                  <tr key={r} className="border-t align-top">
                    <th className="sticky left-0 bg-background px-3 py-2 text-left font-medium">{meal.label}</th>
                    {meal.days.map((d, i) => (
                      <td key={i} className="px-3 py-2 leading-snug">
                        {d || <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {protocol.remarks.length > 0 && (
                  <tr className="border-t align-top">
                    <th className="sticky left-0 bg-background px-3 py-2 text-left font-medium">Remarks</th>
                    <td colSpan={days} className="px-3 py-2">
                      <ul className="flex flex-wrap gap-x-6 gap-y-1">
                        {protocol.remarks.map((r, i) => (
                          <li key={i}>• {r}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Block title="Foods NOT allowed (strict elimination)">
        <Chips items={protocol.avoid} tone="bad" />
      </Block>

      <div className="grid gap-4 md:grid-cols-2">
        <Block title="Low GI vegetables">
          <Chips items={protocol.vegetables} tone="good" />
        </Block>
        <Block title="Low GI fruits (portion controlled)">
          <Chips items={protocol.fruits} tone="good" />
        </Block>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Block title="Portion measurements">
          {protocol.portions.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1 font-medium">Measurement</th>
                  <th className="pb-1 font-medium">Approx value</th>
                </tr>
              </thead>
              <tbody>
                {protocol.portions.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1.5">{p.measure}</td>
                    <td className="py-1.5 tabular-nums">{p.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </Block>
        <Block title="Grocery list">
          {protocol.grocery.length ? (
            <ul className="space-y-1 text-sm">
              {protocol.grocery.map((g, i) => (
                <li key={i} className="flex items-center gap-2">
                  <ShoppingBasket className="h-3.5 w-3.5 text-muted-foreground" /> {g}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </Block>
      </div>

      {protocol.links.length > 0 && (
        <Block title="Where to buy">
          <ul className="divide-y text-sm">
            {protocol.links.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{l.name}</span>
                  {l.store && <span className="ml-2 text-xs text-muted-foreground">{l.store}</span>}
                </span>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted print:hidden"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
                <span className="hidden w-full break-all text-[10px] text-muted-foreground print:block">{l.url}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Physician constraints">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {protocol.physicianConstraints || "No specific restrictions mentioned by doctor."}
        </p>
      </Block>
    </div>
  )
}

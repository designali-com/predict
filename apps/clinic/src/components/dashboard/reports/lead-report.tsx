import { db } from "@workspace/db/client"
import { contact } from "@workspace/db/schema"
import { and, count, eq, gte, isNull, or, sql, type SQL } from "@workspace/db"
import { Radio, Sprout, TrendingUp } from "lucide-react"
import { ContactStage } from "@workspace/db/contact-stage"
import { Panel } from "../overview/ui"
import { BucketChart } from "../overview/bucket-chart"
import { trendSpec, type Period } from "../overview/period"
import { FunnelSteps, Metric, NotTracked, ShareTable } from "./ui"
import { isPartnerClinic } from "@workspace/db/clinic-service"
import { clinicContext } from "@/src/lib/auth/clinic"

/**
 * Where leads come from, and which of them turn into patients.
 *
 * The metric that decides a marketing budget is not how many leads a channel
 * produced — it is how many of them were still there at the end. A source that
 * brings nine hundred contacts and converts two is worse than one that brings
 * twelve and converts six, and a report that only ranks volume says the
 * opposite. So every source row carries its own conversion rate.
 */

function rate(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

export async function LeadReport({ period, since }: { period: Period; since: Date | null }) {
  const context = await clinicContext()
  if (!context) return null
  const clinicId = context.clinic.id
  // This clinic's contacts, and the unplaced ones our own clinics share —
  // never those for a partner. Every query below filters on inRange.
  const inRange: SQL | undefined = and(
    isPartnerClinic(context.clinic)
      ? eq(contact.clinicId, clinicId)
      : or(eq(contact.clinicId, clinicId), isNull(contact.clinicId)),
    since ? gte(contact.createdAt, since) : undefined,
  )
  const { unit, format } = trendSpec(period)
  const truncated = sql`date_trunc('${sql.raw(unit)}', ${contact.createdAt})`

  const [[totals], stageRows, sourceRows, platformRows, buckets, [timeToBook]] = await Promise.all([
    db
      .select({
        total: count(),
        booked: sql<number>`count(*) filter (where ${contact.stage} = ${ContactStage.BOOKED})::int`,
        patients: sql<number>`count(*) filter (where ${contact.stage} = ${ContactStage.PATIENT})::int`,
        lost: sql<number>`count(*) filter (where ${contact.stage} = ${ContactStage.LOST})::int`,
      })
      .from(contact)
      .where(inRange),
    db.select({ key: contact.stage, n: count() }).from(contact).where(inRange).groupBy(contact.stage),
    // Volume and conversion together, per source. Two queries would let the
    // two halves disagree about which contacts they counted.
    db
      .select({
        key: contact.source,
        n: count(),
        converted: sql<number>`count(*) filter (where ${contact.stage} in (${ContactStage.BOOKED}, ${ContactStage.PATIENT}))::int`,
      })
      .from(contact)
      .where(inRange)
      .groupBy(contact.source),
    db
      .select({ key: contact.sourcePlatform, n: count() })
      .from(contact)
      .where(inRange)
      .groupBy(contact.sourcePlatform),
    db
      .select({ bucket: sql<string>`to_char(${truncated}, '${sql.raw(format)}')`, count: count() })
      .from(contact)
      .where(inRange)
      .groupBy(truncated)
      .orderBy(truncated),
    // First touch to the point they became a patient. Only rows that have both
    // ends count, so a lead still in the funnel does not read as instant.
    db
      .select({
        days: sql<
          number | null
        >`round(avg(extract(epoch from (${contact.updatedAt} - ${contact.firstTouchAt})) / 86400) filter (where ${contact.stage} = ${ContactStage.PATIENT} and ${contact.firstTouchAt} is not null)::numeric, 1)`,
      })
      .from(contact)
      .where(inRange),
  ])

  const total = totals?.total ?? 0
  const booked = totals?.booked ?? 0
  const patients = totals?.patients ?? 0
  const converted = booked + patients

  const sources = sourceRows
    .map((r) => ({
      label: r.key ?? "Unknown",
      value: r.n,
      hint: `${rate(r.converted, r.n)}% converted`,
      converted: r.converted,
    }))
    .sort((a, b) => b.value - a.value)

  const best = [...sources].filter((s) => s.value >= 5).sort((a, b) => rate(b.converted, b.value) - rate(a.converted, a.value))[0]

  const platforms = platformRows.filter((r) => r.key)

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="New contacts" value={total} of="in this period" />
        <Metric
          label="Booked"
          value={`${rate(converted, total)}%`}
          of={`${converted} reached a booking`}
        />
        <Metric
          label="Became patients"
          value={`${rate(patients, total)}%`}
          of={`${patients} attended a visit`}
        />
        <Metric
          label="Lost"
          value={`${rate(totals?.lost ?? 0, total)}%`}
          of={`${totals?.lost ?? 0} written off`}
          tone={rate(totals?.lost ?? 0, total) > 30 ? "bad" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Panel title="New contacts over time" icon={TrendingUp} fill>
            <BucketChart rows={buckets} headline={total} caption="new in this period" />
          </Panel>
        </div>

        <div className="lg:col-span-5">
          <Panel title="Funnel" icon={Sprout} fill>
            <FunnelSteps
              steps={[
                { label: "Contacts", value: total },
                { label: "Booked", value: converted },
                { label: "Attended", value: patients },
              ]}
            />
            <div className="mt-5 border-t border-black/12 pt-4 dark:border-white/5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
                By stage
              </p>
              <ShareTable
                rows={stageRows.map((r) => ({ label: r.key, value: r.n }))}
                total={total}
                empty="No contacts in this period."
              />
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Panel title="Source — volume and conversion" icon={Radio} fill>
            <ShareTable rows={sources} total={total} empty="No contacts in this period." />
            {best && (
              <p className="mt-4 border-t border-black/12 pt-3 text-xs text-black/60 dark:border-white/5 dark:text-white/45">
                Best converting source with real volume: <strong>{best.label}</strong> at{" "}
                {rate(best.converted, best.value)}% — the bar length is volume, the percentage
                beside each name is what became of it.
              </p>
            )}
          </Panel>
        </div>

        <div className="lg:col-span-5">
          <Panel title="Campaign attribution" icon={Radio} fill>
            {platforms.length === 0 ? (
              <NotTracked
                what="No contact carries an ad platform or campaign"
                why="Click-to-WhatsApp leads arrive with Meta's referral payload on their first message. Until the webhook is live and capturing it, every ad-sourced lead looks the same as a walk-in."
              />
            ) : (
              <ShareTable
                rows={platforms.map((r) => ({ label: r.key!, value: r.n }))}
                total={platforms.reduce((s, r) => s + r.n, 0)}
              />
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Time to convert" icon={TrendingUp}>
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">
              {timeToBook?.days != null ? `${timeToBook.days} days` : "—"}
            </p>
            <p className="mt-1 text-sm text-black/60 dark:text-white/45">
              average from first contact to becoming a patient
            </p>
          </div>
        </div>
        <p className="mt-4 text-xs text-black/60 dark:text-white/40">
          Measured only on contacts that got there, so a lead still in the funnel does not read as
          instant. It is the number a follow-up cadence is built around: nurture that stops before
          this figure stops before the average lead was ever going to convert.
        </p>
      </Panel>
    </>
  )
}

import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { leadRule } from "@workspace/db/schema";
import { and, asc, eq, sql } from "@workspace/db";
import { ruleMatches } from "@workspace/db/lead-routing";
import { requirePermission } from "@/src/lib/auth/guards";
import { metaAdLinks } from "@/src/lib/meta-ad-links";
import { metaAdSpend } from "@/src/lib/meta-ad-insights";

/**
 * Every ad that has produced a lead: how many, how far they went, and the
 * ICP it maps to — or none.
 *
 * Two jobs. The unmapped rows: a new video goes live, its leads arrive with
 * no ICP, and they all get the _general message — this is where that shows
 * up, a day in rather than a month in. And which ads are worth the spend:
 * leads alone flatter an ad whose people never pick up.
 *
 * ?days=7|30|90 (default all time) — by when the lead arrived.
 *
 * Each person counts once, for the ad that brought them first (first touch).
 * A person who filled two ads' forms would otherwise be two bookings.
 *
 * Funnel, per person:
 *   reached  — any call outcome set (not New)
 *   booked   — an appointment, or an appointment status
 *   visited  — Visited, arrived for an appointment, or a patient now
 *   patient  — stage Patient, or has paid us anything
 *   revenue  — what they paid (not voided) since their lead arrived
 *   junk     — wrong number, duplicate, not interested, out of area
 */

const RANGES = [7, 30, 90];

type Row = {
  provider: string;
  ad_id: string | null;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  form_name: string | null;
  submissions: number;
  people: number;
  reached: number;
  booked: number;
  visited: number;
  patients: number;
  junk: number;
  revenue_paise: string | number | null;
  first_at: string;
  last_at: string;
};

export async function GET(req: Request) {
  const session = await requirePermission("ops.lead_routing");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const requestedDays = Number(url.searchParams.get("days"));
  const days = RANGES.includes(requestedDays) ? requestedDays : null;
  // received_at is written in UTC by drizzle; compare against a UTC wall time.
  const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const inRange = since ? sql`l.received_at >= ${since}::timestamp` : sql`true`;

  const result = await db.execute(sql`
    with subs as (
      select l.*, coalesce(l.ad_id, l.ad_name, l.form_name, l.provider) as ad_key
      from lead_submission l
      where not l.is_test and ${inRange}
    ),
    -- The ad that brought each person first.
    first_touch as (
      select distinct on (s.contact_id) s.contact_id, s.provider, s.ad_key, s.received_at
      from subs s
      where s.contact_id is not null
      order by s.contact_id, s.received_at asc
    ),
    person as (
      select
        f.provider, f.ad_key, f.contact_id,
        coalesce(c.lead_status, 'NEW') <> 'NEW' as reached,
        (exists (select 1 from appointment a where a.contact_id = f.contact_id)
          or c.lead_status in ('APPOINTMENT_BOOKED','APPOINTMENT_CONFIRMED','APPOINTMENT_MISSED','APPOINTMENT_CANCELLED','VISITED')
          or c.stage in ('BOOKED','PATIENT')) as booked,
        (c.lead_status = 'VISITED' or c.stage = 'PATIENT'
          or exists (select 1 from appointment a where a.contact_id = f.contact_id and a.arrived_at is not null)) as visited,
        (c.stage = 'PATIENT'
          or exists (select 1 from payment p where p.contact_id = f.contact_id and p.voided_at is null)) as patient,
        c.lead_status in ('INVALID_NUMBER','DUPLICATE','NOT_INTERESTED','OUT_OF_AREA') as junk,
        (select coalesce(sum(p.amount_in_paise), 0) from payment p
          where p.contact_id = f.contact_id and p.voided_at is null and p.collected_at >= f.received_at) as revenue
      from first_touch f
      join contact c on c.id = f.contact_id
    ),
    funnel as (
      select provider, ad_key,
        count(*)::int as people,
        count(*) filter (where reached)::int as reached,
        count(*) filter (where booked)::int as booked,
        count(*) filter (where visited)::int as visited,
        count(*) filter (where patient)::int as patients,
        count(*) filter (where junk)::int as junk,
        sum(revenue)::bigint as revenue_paise
      from person
      group by provider, ad_key
    ),
    ads as (
      select provider, ad_key,
        max(ad_id) as ad_id, max(ad_name) as ad_name, max(adset_name) as adset_name,
        max(campaign_name) as campaign_name, max(form_name) as form_name,
        count(*)::int as submissions,
        min(received_at) as first_at, max(received_at) as last_at
      from subs
      group by provider, ad_key
    )
    select a.provider, a.ad_id, a.ad_name, a.adset_name, a.campaign_name, a.form_name, a.submissions,
      coalesce(f.people, 0) as people, coalesce(f.reached, 0) as reached, coalesce(f.booked, 0) as booked,
      coalesce(f.visited, 0) as visited, coalesce(f.patients, 0) as patients, coalesce(f.junk, 0) as junk,
      coalesce(f.revenue_paise, 0) as revenue_paise,
      to_char(a.first_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as first_at,
      to_char(a.last_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_at
    from ads a
    left join funnel f on f.provider = a.provider and f.ad_key = a.ad_key
    order by a.submissions desc, a.last_at desc
    limit 500
  `);
  const rows = (result.rows ?? []) as unknown as Row[];

  const icps = await db
    .select()
    .from(leadRule)
    .where(and(eq(leadRule.kind, "interest"), eq(leadRule.active, true)))
    .orderBy(asc(leadRule.priority), asc(leadRule.createdAt));

  // Where to look at each ad (preview, posts, Ads Manager). Meta only.
  const links = await metaAdLinks(rows.filter((a) => a.provider === "meta" && a.ad_id).map((a) => a.ad_id!));
  // What each ad cost over the same window — from its ad account.
  const spend = await metaAdSpend(
    [...links.entries()].filter(([, l]) => l.accountId).map(([adId, l]) => ({ adId, accountId: l.accountId! })),
    days,
  );

  return NextResponse.json({
    days,
    ads: rows.map((a) => {
      const icp = icps.find((r) =>
        ruleMatches(r, {
          adsetName: a.adset_name,
          campaignName: a.campaign_name,
          adName: a.ad_name,
          adId: a.ad_id,
          formName: a.form_name,
        }),
      );
      return {
        provider: a.provider,
        adId: a.ad_id,
        adName: a.ad_name,
        adsetName: a.adset_name,
        campaignName: a.campaign_name,
        formName: a.form_name,
        // `leads` kept for anything still reading the old shape.
        leads: a.submissions,
        submissions: a.submissions,
        people: a.people,
        reached: a.reached,
        booked: a.booked,
        visited: a.visited,
        patients: a.patients,
        junk: a.junk,
        revenueInPaise: Number(a.revenue_paise ?? 0),
        firstAt: a.first_at,
        lastAt: a.last_at,
        icp: icp?.interest ?? null,
        icpName: icp?.name ?? null,
        links: a.ad_id ? (links.get(a.ad_id) ?? null) : null,
        spend: a.ad_id ? (spend.get(a.ad_id) ?? null) : null,
      };
    }),
  });
}

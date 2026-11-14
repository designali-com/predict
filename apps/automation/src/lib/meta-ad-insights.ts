/**
 * What each ad cost and how far it reached, from Meta's Insights API — read
 * with the page token (it carries ads_read).
 *
 * For the same window as the report: the last N days (IST, the ad account's
 * timezone) or the ad's whole life. One call per ad account, filtered to the
 * ads that sent us leads, paged; kept for 30 minutes per account and window —
 * spend moves through the day, but not by the minute.
 *
 * Never throws: without Meta the report shows its own numbers, no spend.
 */

export interface AdSpend {
  /** Rupees, as Meta reports (account currency INR). */
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  /** Leads as Meta counts them — compared with ours, it shows forms that never reached us. */
  metaLeads: number;
}

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; byAd: Map<string, AdSpend> }>();

type InsightRow = {
  ad_id: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: { action_type: string; value: string }[];
};

const LEAD_ACTIONS = ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped"];

function istDate(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

async function forAccount(accountId: string, adIds: string[], days: number | null, token: string) {
  const key = `${accountId}:${days ?? "all"}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.byAd;

  const params = new URLSearchParams({
    level: "ad",
    fields: "ad_id,spend,impressions,reach,clicks,inline_link_clicks,actions",
    limit: "500",
    filtering: JSON.stringify([{ field: "ad.id", operator: "IN", value: adIds }]),
  });
  if (days) params.set("time_range", JSON.stringify({ since: istDate(-(days - 1)), until: istDate() }));
  else params.set("date_preset", "maximum");

  const byAd = new Map<string, AdSpend>();
  let url: string | null = `https://graph.facebook.com/v21.0/act_${accountId}/insights?${params}`;
  for (let page = 0; url && page < 20; page++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const data = (await res.json().catch(() => null)) as { data?: InsightRow[]; paging?: { next?: string } } | null;
    if (!res.ok || !data?.data) break;
    for (const r of data.data) {
      const leads = (r.actions ?? []).filter((a) => LEAD_ACTIONS.includes(a.action_type)).map((a) => Number(a.value) || 0);
      byAd.set(r.ad_id, {
        spend: Number(r.spend ?? 0),
        impressions: Number(r.impressions ?? 0),
        reach: Number(r.reach ?? 0),
        clicks: Number(r.clicks ?? 0),
        linkClicks: Number(r.inline_link_clicks ?? 0),
        // Meta reports the same leads under several names; the largest is the count.
        metaLeads: leads.length ? Math.max(...leads) : 0,
      });
    }
    url = data.paging?.next ?? null;
  }
  cache.set(key, { at: Date.now(), byAd });
  return byAd;
}

/** A stable pseudo-random number in [0, 1) from a string — the same ad always gets the same figures. */
function seeded(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Demo: believable spend for each ad, scaled to the window. */
function demoSpend(adIds: string[], days: number | null): Map<string, AdSpend> {
  const scale = days ? Math.min(1, days / 90) : 1;
  return new Map(
    adIds.map((id) => {
      const r = seeded(id);
      const spend = Math.round((4000 + r * 26000) * scale);
      const impressions = Math.round(spend * (90 + r * 60));
      const linkClicks = Math.round(impressions * (0.006 + r * 0.01));
      return [id, { spend, impressions, reach: Math.round(impressions * 0.62), clicks: Math.round(linkClicks * 1.8), linkClicks, metaLeads: 0 }];
    }),
  );
}

/** Spend per ad id, for the ads given, grouped by their ad account. */
export async function metaAdSpend(ads: { adId: string; accountId: string }[], days: number | null): Promise<Map<string, AdSpend>> {
  if (process.env.DEMO_MODE !== "0") return demoSpend(ads.map((a) => a.adId), days);
  const out = new Map<string, AdSpend>();
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token || ads.length === 0) return out;

  const byAccount = new Map<string, string[]>();
  for (const a of ads) byAccount.set(a.accountId, [...(byAccount.get(a.accountId) ?? []), a.adId]);

  await Promise.all(
    [...byAccount.entries()].map(async ([accountId, ids]) => {
      try {
        const got = await forAccount(accountId, [...new Set(ids)], days, token);
        for (const [id, s] of got) out.set(id, s);
      } catch (error) {
        console.error(`[ads] Meta spend for act_${accountId} failed:`, error);
      }
    }),
  );
  return out;
}

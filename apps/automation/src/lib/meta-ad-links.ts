/**
 * Where to look at an ad: its shareable preview, the Facebook / Instagram post
 * it runs as, Ads Manager, and a thumbnail — read from the Marketing API with
 * the page token (it carries ads_read).
 *
 * Asked 50 ads at a time and kept for an hour: the report is opened often and
 * an ad's post does not change. The thumbnail is a signed CDN link that
 * expires after a while, which the hour also stays well inside.
 *
 * Never throws: an ad Meta will not describe (deleted, another account) just
 * has no links, and the report shows without them.
 */

export interface AdLinks {
  preview: string | null;
  facebook: string | null;
  instagram: string | null;
  adsManager: string | null;
  thumbnail: string | null;
  /** ACTIVE, PAUSED, ARCHIVED … as Meta says. */
  status: string | null;
  /** The ad account, for reading its spend. */
  accountId: string | null;
}

const TTL_MS = 60 * 60 * 1000;
const BATCH = 50;
const cache = new Map<string, { at: number; links: AdLinks | null }>();

type GraphAd = {
  id: string;
  effective_status?: string;
  preview_shareable_link?: string;
  account_id?: string;
  creative?: { effective_object_story_id?: string; instagram_permalink_url?: string; thumbnail_url?: string };
};

function shape(ad: GraphAd): AdLinks {
  const story = ad.creative?.effective_object_story_id;
  return {
    preview: ad.preview_shareable_link ?? null,
    // "pageid_postid" opens as the post on facebook.com.
    facebook: story ? `https://www.facebook.com/${story}` : null,
    instagram: ad.creative?.instagram_permalink_url ?? null,
    adsManager: ad.account_id
      ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${ad.account_id}&selected_ad_ids=${ad.id}`
      : null,
    thumbnail: ad.creative?.thumbnail_url ?? null,
    status: ad.effective_status ?? null,
    accountId: ad.account_id ?? null,
  };
}

export async function metaAdLinks(adIds: string[]): Promise<Map<string, AdLinks>> {
  // Demo: every seeded ad gets a thumbnail and a status, and no outside link
  // that would lead to a real account. The account id lets spend be "read".
  if (process.env.DEMO_MODE !== "0") {
    const thumbs = ["/images/running.png", "/predict-icon.svg"];
    return new Map(
      [...new Set(adIds)].map((id, i) => [
        id,
        {
          preview: null,
          facebook: null,
          instagram: null,
          adsManager: null,
          thumbnail: thumbs[i % thumbs.length]!,
          status: i % 4 === 3 ? "PAUSED" : "ACTIVE",
          accountId: "demo",
        },
      ]),
    );
  }
  const out = new Map<string, AdLinks>();
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  // Meta ad ids are long digit strings; anything else (a form name) is not an ad.
  const ids = [...new Set(adIds.filter((id) => /^\d{6,}$/.test(id)))];
  if (!token || ids.length === 0) return out;

  const now = Date.now();
  const missing: string[] = [];
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && now - hit.at < TTL_MS) {
      if (hit.links) out.set(id, hit.links);
    } else missing.push(id);
  }

  const fields =
    "effective_status,preview_shareable_link,account_id,creative{effective_object_story_id,instagram_permalink_url,thumbnail_url}";
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    try {
      const url = `https://graph.facebook.com/v21.0/?ids=${batch.join(",")}&fields=${encodeURIComponent(fields)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      const data = (await res.json().catch(() => null)) as Record<string, GraphAd> | { error?: unknown } | null;
      if (!res.ok || !data || "error" in data) {
        // One bad id fails the whole batch; ask for these one by one instead.
        await Promise.all(
          batch.map(async (id) => {
            try {
              const one = await fetch(`https://graph.facebook.com/v21.0/${id}?fields=${encodeURIComponent(fields)}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(8000),
              });
              const ad = (await one.json().catch(() => null)) as GraphAd | null;
              const links = one.ok && ad?.id ? shape(ad) : null;
              cache.set(id, { at: now, links });
              if (links) out.set(id, links);
            } catch {
              // Not cached: Meta may simply have been slow; try again next time.
            }
          }),
        );
        continue;
      }
      for (const id of batch) {
        const ad = (data as Record<string, GraphAd>)[id];
        const links = ad ? shape(ad) : null;
        cache.set(id, { at: now, links });
        if (links) out.set(id, links);
      }
    } catch (error) {
      console.error("[ads] Meta ad links failed:", error);
    }
  }
  return out;
}

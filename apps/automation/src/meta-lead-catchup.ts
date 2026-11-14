import { db } from "@workspace/db/client";
import { ingestLead } from "@workspace/db/lead-intake";
import { listMetaForms, listMetaLeads, metaTokenFor } from "./lead-sources";

// Meta's Page webhook does not deliver a lead ad filled by someone who has
// no role on the app while that app is still in development. The marketing
// CRM still receives it. This pull is what puts those leads on the ops list
// without waiting for the webhook.
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const FORM_CACHE_MS = 30 * 60 * 1000;
const BATCH = 8;

let running = false;
let cursor = 0;
let formsCache: { at: number; pageId: string; forms: { id: string; name?: string }[] } | null = null;

function pageIds(): string[] {
  return (process.env.META_PAGE_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function catchUpMetaLeads(opts?: { since?: Date; all?: boolean }): Promise<{ created: number; scanned: number }> {
  if (running) return { created: 0, scanned: 0 };
  const ids = pageIds();
  if (!ids.length) return { created: 0, scanned: 0 };

  running = true;
  let created = 0;
  let scanned = 0;
  try {
    const since = opts?.since ?? new Date(Date.now() - LOOKBACK_MS);
    for (const pageId of ids) {
      if (!metaTokenFor(pageId)) continue;
      const forms = await formsFor(pageId);
      const batch = opts?.all ? forms : nextBatch(forms);
      for (const form of batch) {
        scanned += 1;
        let leads;
        try {
          leads = await listMetaLeads(pageId, form, since);
        } catch (err) {
          console.error(`[leads] catch-up form ${form.id} failed: ${err instanceof Error ? err.message : err}`);
          continue;
        }
        for (const lead of leads) {
          try {
            const result = await ingestLead(db, lead);
            if (result.status === "created") {
              created += 1;
              console.log(`[leads] catch-up ${lead.externalId} created`);
            }
          } catch (err) {
            console.error(`[leads] catch-up ${lead.externalId} failed: ${err instanceof Error ? err.message : err}`);
          }
        }
      }
    }
    if (created > 0) console.log(`[leads] catch-up created ${created}`);
    return { created, scanned };
  } finally {
    running = false;
  }
}

async function formsFor(pageId: string) {
  if (formsCache && formsCache.pageId === pageId && Date.now() - formsCache.at < FORM_CACHE_MS) {
    return formsCache.forms;
  }
  const forms = (await listMetaForms(pageId)).filter((form) => !form.status || form.status === "ACTIVE");
  formsCache = { at: Date.now(), pageId, forms };
  return forms;
}

function nextBatch(forms: { id: string; name?: string }[]) {
  if (forms.length <= BATCH) return forms;
  const start = cursor % forms.length;
  cursor = (start + BATCH) % forms.length;
  if (start + BATCH <= forms.length) return forms.slice(start, start + BATCH);
  return [...forms.slice(start), ...forms.slice(0, BATCH - (forms.length - start))];
}

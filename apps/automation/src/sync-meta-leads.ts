import "dotenv/config";
import { db } from "@workspace/db/client";
import { ingestLead, pendingLeadSubmissions, type LeadInput } from "@workspace/db/lead-intake";
import { fetchMetaLead, listMetaForms, listMetaLeads, metaTokenFor } from "./lead-sources";

/**
 * Catches up on Meta leads the webhook missed.
 *
 *   pnpm sync:meta-leads                 retry parked leads + pull the last 2 days
 *   pnpm sync:meta-leads --days 7        pull further back
 *   pnpm sync:meta-leads --page <id>     only this Page (repeatable)
 *   pnpm sync:meta-leads --dry-run       list what would be ingested, write nothing
 *
 * Safe to run any number of times: ingestLead is idempotent on leadgen_id, so
 * a lead already received is skipped and nobody is messaged twice. Meta keeps
 * leads for 90 days — anything older cannot be recovered from the API.
 *
 * Careful with --days on a first run: every lead it pulls that is not already
 * a contact fires LEAD_CAPTURED, which starts the nurture flow for them.
 */

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const daysArg = args.indexOf("--days");
const days = daysArg >= 0 ? Number(args[daysArg + 1]) : 2;
const pages = args.flatMap((a, i) => (a === "--page" && args[i + 1] ? [args[i + 1]!] : []));

function configuredPages(): string[] {
  if (pages.length) return pages;
  const fromEnv = (process.env.META_PAGE_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  try {
    return Object.keys(JSON.parse(process.env.META_PAGE_TOKENS ?? "{}"));
  } catch {
    return [];
  }
}

const counts: Record<string, number> = {};
async function ingest(input: LeadInput) {
  if (dryRun) {
    console.log(`  would ingest ${input.externalId}  ${input.name ?? "?"}  ${input.phone ?? input.email ?? "-"}  [${input.formName ?? input.formId}]`);
    counts.dry = (counts.dry ?? 0) + 1;
    return;
  }
  const result = await ingestLead(db, input);
  counts[result.status] = (counts[result.status] ?? 0) + 1;
  if (result.status !== "duplicate") console.log(`  ${input.externalId} -> ${result.status}`);
}

async function main() {
  if (!Number.isFinite(days) || days <= 0 || days > 90) throw new Error("--days must be between 1 and 90");

  // 1. Leads whose webhook arrived but whose fetch failed.
  const pending = await pendingLeadSubmissions(db, "meta");
  console.log(`[sync] ${pending.length} parked Meta lead(s) to retry`);
  for (const row of pending) {
    try {
      await ingest(await fetchMetaLead(row.externalId, row.pageId));
    } catch (err) {
      console.error(`  ${row.externalId} still failing: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 2. Anything the webhook never told us about.
  const pageIds = configuredPages();
  if (!pageIds.length) {
    console.log("[sync] no Page ids (set META_PAGE_IDS or META_PAGE_TOKENS, or pass --page) — skipping form scan");
  }
  const since = new Date(Date.now() - days * 86_400_000);
  for (const pageId of pageIds) {
    if (!metaTokenFor(pageId)) {
      console.error(`[sync] no token for page ${pageId}`);
      continue;
    }
    const forms = await listMetaForms(pageId);
    console.log(`[sync] page ${pageId}: ${forms.length} form(s), leads since ${since.toISOString()}`);
    for (const form of forms) {
      const leads = await listMetaLeads(pageId, form, since);
      if (leads.length) console.log(` form "${form.name ?? form.id}": ${leads.length} lead(s)`);
      for (const lead of leads) {
        try {
          await ingest(lead);
        } catch (err) {
          console.error(`  ${lead.externalId} failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }

  console.log("[sync] done", counts);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

import { db } from "@workspace/db/client";
import { communicationTemplate } from "@workspace/db/schema";
import { and, eq, ne } from "@workspace/db";

// Submission is fire-and-forget: Meta reviews asynchronously and can approve,
// reject, *or silently recategorise* a template (UTILITY -> MARKETING is
// common) without notifying us. Nothing in the send path learns about that,
// so the dashboard would keep showing whatever we guessed at submit time
// until someone pulls the current state back down — which is what this does.

interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  rejected_reason?: string;
  quality_score?: { score?: string };
}

export interface TemplateSyncChange {
  key: string;
  field: string;
  from: string | null;
  to: string | null;
}

export interface TemplateSyncResult {
  ok: boolean;
  error?: string;
  /** Templates whose stored state differed from Meta's and were rewritten. */
  updated: number;
  /** Rows checked against Meta (skips drafts that were never submitted). */
  checked: number;
  changes: TemplateSyncChange[];
  /** Local rows whose providerTemplateName no longer exists on the WABA. */
  missingOnMeta: string[];
}

export async function syncTemplatesFromMeta(): Promise<TemplateSyncResult> {
  const empty = { updated: 0, checked: 0, changes: [], missingOnMeta: [] };

  const wabaId = process.env.WHATSAPP_WABA_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!wabaId || !accessToken) {
    return { ok: false, error: "WHATSAPP_WABA_ID / WHATSAPP_ACCESS_TOKEN not configured", ...empty };
  }

  let payload: { data?: MetaTemplate[]; error?: { message?: string } } | null;
  let res: Response;
  try {
    res = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/message_templates` +
        `?limit=200&fields=id,name,status,category,language,rejected_reason,quality_score`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    payload = await res.json().catch(() => null);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), ...empty };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: payload?.error?.message ?? `HTTP ${res.status}`,
      ...empty,
    };
  }

  // Meta keys templates by name+language; our rows carry a single language
  // each, so the name alone is enough to match.
  const remote = new Map<string, MetaTemplate>();
  for (const t of payload?.data ?? []) remote.set(t.name, t);

  const rows = await db
    .select()
    .from(communicationTemplate)
    // Deleted on Meta on purpose: nothing to reconcile, and not "missing".
    .where(and(eq(communicationTemplate.channel, "whatsapp"), ne(communicationTemplate.submissionStatus, "deleted")));

  const changes: TemplateSyncChange[] = [];
  const missingOnMeta: string[] = [];
  let updated = 0;
  let checked = 0;

  for (const row of rows) {
    // Never submitted — nothing on Meta's side to reconcile against.
    if (!row.providerTemplateName) continue;

    const match = remote.get(row.providerTemplateName);
    if (!match) {
      missingOnMeta.push(row.key);
      continue;
    }
    checked++;

    const next = {
      submissionStatus: match.status.toLowerCase(),
      wabaCategory: match.category,
      wabaTemplateId: match.id,
      rejectionReason:
        match.rejected_reason && match.rejected_reason !== "NONE" ? match.rejected_reason : null,
      qualityRating: match.quality_score?.score ?? null,
    };

    const diffs = Object.entries(next).filter(
      ([field, value]) => (row as Record<string, unknown>)[field] !== value,
    );
    if (diffs.length === 0) continue;

    await db
      .update(communicationTemplate)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(communicationTemplate.id, row.id));
    updated++;

    for (const [field, value] of diffs) {
      changes.push({
        key: row.key,
        field,
        from: ((row as Record<string, unknown>)[field] as string | null) ?? null,
        to: (value as string | null) ?? null,
      });
    }
  }

  return { ok: true, updated, checked, changes, missingOnMeta };
}

import { db } from "@workspace/db/client";
import { campaign, campaignRecipient, communicationMessage, communicationTemplate, contact } from "@workspace/db/schema";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "@workspace/db";
import { ContactStage } from "@workspace/db/contact-stage";
import { sendCommunication } from "@workspace/communication";
import { syncTemplatesFromMeta } from "./lib/sync-templates-from-meta";

/**
 * Sending a campaign, one batch at a time.
 *
 * Two callers: the campaign page's old in-browser loop (POST …/send), and the
 * automation worker, which sends scheduled campaigns from the server so a
 * 19,000-message send does not depend on somebody's tab staying open for an
 * hour. Both go through the same batch, and every recipient's message carries
 * an idempotency key, so the two can never double-send to one person even if
 * they overlap.
 */

const BATCH_SIZE = 25;
// A few at a time: sequential is needlessly slow, unbounded parallelism trips
// the Cloud API rate limit and turns a send into a wall of 429s.
const CONCURRENCY = 5;

async function contactFor(phone: string, name: string | null): Promise<string | null> {
  const [existing] = await db.select().from(contact).where(eq(contact.phone, phone)).limit(1);
  if (existing) return existing.id;

  try {
    const [created] = await db
      .insert(contact)
      .values({
        phone,
        name,
        // Receiving a broadcast is not an enquiry. They become a LEAD if they
        // reply or fill a form — see promoteToLead() — not because we sent.
        stage: ContactStage.AUDIENCE,
        source: "CAMPAIGN",
        firstTouchAt: new Date(),
        lastTouchAt: new Date(),
      })
      .returning();
    return created?.id ?? null;
  } catch {
    // Two batches racing on contact_phone_unique: the loser reads the winner's
    // row rather than dropping the recipient.
    const [raced] = await db.select().from(contact).where(eq(contact.phone, phone)).limit(1);
    return raced?.id ?? null;
  }
}

export interface BatchResult {
  done: boolean;
  processed: number;
  sent: number;
  failed: number;
  pending: number;
}

/** Send the next batch of a campaign's pending recipients. Null if there is no such campaign. */
export async function sendCampaignBatch(
  id: string,
  sentBy: string | null,
  opts: { batchSize?: number; concurrency?: number; newestFirst?: boolean } = {},
): Promise<BatchResult | null> {
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const concurrency = opts.concurrency ?? CONCURRENCY;

  const [row] = await db
    .select({ campaign, template: communicationTemplate })
    .from(campaign)
    .innerJoin(communicationTemplate, eq(communicationTemplate.id, campaign.templateId))
    .where(eq(campaign.id, id))
    .limit(1);
  if (!row) return null;

  const batch = await db
    .select()
    .from(campaignRecipient)
    .where(and(eq(campaignRecipient.campaignId, id), eq(campaignRecipient.status, "pending")))
    .orderBy(opts.newestFirst ? desc(campaignRecipient.createdAt) : asc(campaignRecipient.createdAt))
    .limit(batchSize);

  if (!batch.length) {
    await db.update(campaign).set({ status: "completed", updatedAt: new Date() }).where(eq(campaign.id, id));
    return { done: true, processed: 0, sent: 0, failed: 0, pending: 0 };
  }

  if (row.campaign.status !== "sending") {
    await db.update(campaign).set({ status: "sending", updatedAt: new Date() }).where(eq(campaign.id, id));
  }

  // Only the variables the template actually declares.
  //
  // Sending an extra one is not ignored: with an empty variablesSchema,
  // orderTemplateVariables falls back to treating every key it was handed as a
  // positional parameter, so one stray value turns a zero-parameter template
  // into a one-parameter send and WhatsApp rejects it with "Number of
  // parameters does not match the expected number of params".
  const declared = Array.isArray(row.template.variablesSchema)
    ? (row.template.variablesSchema as unknown[]).filter((n): n is string => typeof n === "string")
    : [];
  const campaignVariables = (row.campaign.variables ?? {}) as Record<string, string>;

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < batch.length; i += concurrency) {
    await Promise.all(
      batch.slice(i, i + concurrency).map(async (recipient) => {
        try {
          const contactId = recipient.contactId ?? (await contactFor(recipient.phone, recipient.name));
          if (!contactId) throw new Error("Could not create a contact for this number");

          // The recipient's own name fills a "name" variable when the template
          // asks for one; everything else comes from the campaign.
          const variables: Record<string, string> = {};
          for (const key of declared) {
            variables[key] = (key === "name" ? recipient.name : null) ?? campaignVariables[key] ?? "";
          }

          const result = await sendCommunication({
            contactId,
            templateKey: row.template.key,
            variables,
            sentBy: sentBy ?? undefined,
            // One message per recipient per attempt, so a retried batch cannot
            // double-send — and the automatic second attempt gets its own key
            // rather than being handed back the failed first message.
            idempotencyKey:
              recipient.attempts > 1 ? `campaign:${id}:${recipient.id}:try${recipient.attempts}` : `campaign:${id}:${recipient.id}`,
          });

          // sendCommunication reports a refusal and a provider failure the
          // same way it reports a success — by returning — so both have to be
          // read off the result rather than caught.
          const outcome =
            result.status === "skipped_no_consent"
              ? { status: "skipped", error: "Contact has opted out" }
              : result.status === "failed"
                ? { status: "failed", error: result.error ?? "WhatsApp rejected the message" }
                : { status: "sent", error: null };

          await db
            .update(campaignRecipient)
            .set({ contactId, messageId: result.messageId, status: outcome.status, error: outcome.error, updatedAt: new Date() })
            .where(eq(campaignRecipient.id, recipient.id));

          if (outcome.status === "sent") sent++;
          else failed++;
        } catch (error) {
          failed++;
          await db
            .update(campaignRecipient)
            .set({ status: "failed", error: error instanceof Error ? error.message : String(error), updatedAt: new Date() })
            .where(eq(campaignRecipient.id, recipient.id))
            .catch(() => {});
        }
      }),
    );
  }

  const [remaining] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaignRecipient)
    .where(and(eq(campaignRecipient.campaignId, id), eq(campaignRecipient.status, "pending")));

  const pending = remaining?.count ?? 0;
  if (pending === 0) {
    await db.update(campaign).set({ status: "completed", updatedAt: new Date() }).where(eq(campaign.id, id));
  }

  return { done: pending === 0, processed: batch.length, sent, failed, pending };
}

// ------------------------------------------------------------------ worker

let running = false;
const waitingLogged = new Set<string>();
let lastTemplateSync = 0;

/**
 * The worker's tick: send every campaign whose time has come, from the
 * server. A campaign stays "sending" until its last recipient is handled, so a
 * worker restart mid-send (a deploy) simply picks it up again on the next tick.
 *
 * "paused" is how the page stops one; the loop reads the status before every
 * batch, so a pause takes effect within one batch.
 */
export async function runDueCampaigns(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await queueRetries();

    const due = await db
      .select({
        id: campaign.id,
        name: campaign.name,
        by: campaign.createdByUserId,
        templateStatus: communicationTemplate.submissionStatus,
      })
      .from(campaign)
      .innerJoin(communicationTemplate, eq(communicationTemplate.id, campaign.templateId))
      .where(
        and(
          inArray(campaign.status, ["scheduled", "sending"]),
          isNotNull(campaign.scheduledAt),
          lte(campaign.scheduledAt, new Date()),
        ),
      )
      .orderBy(asc(campaign.scheduledAt));

    for (const c of due) {
      // Still in Meta review at its time: hold it, check again next tick. Every
      // message would be rejected, and a rejected recipient is not retried.
      if (c.templateStatus !== "approved") {
        if (!waitingLogged.has(c.id)) {
          console.log(`[campaign] "${c.name}" is due but its template is ${c.templateStatus} — waiting for approval`);
          waitingLogged.add(c.id);
        }
        // Meta does not tell us when it approves; pull the status down now
        // and then, so the send starts within minutes of approval.
        if (Date.now() - lastTemplateSync > 5 * 60_000) {
          lastTemplateSync = Date.now();
          await syncTemplatesFromMeta().catch((err) => console.error("[campaign] template sync failed:", err));
        }
        continue;
      }
      console.log(`[campaign] sending "${c.name}" (${c.id})`);
      let total = 0;
      let failures = 0;
      for (;;) {
        const [now] = await db.select({ status: campaign.status }).from(campaign).where(eq(campaign.id, c.id)).limit(1);
        if (!now || (now.status !== "scheduled" && now.status !== "sending")) {
          console.log(`[campaign] "${c.name}" is ${now?.status ?? "gone"} — stopping`);
          break;
        }
        let result: BatchResult | null;
        try {
          result = await sendCampaignBatch(c.id, c.by, { batchSize: 50, concurrency: 8 });
          failures = 0;
        } catch (err) {
          // A database blip must not end the send — wait and try the same batch again.
          failures++;
          console.error(`[campaign] batch failed (${failures}):`, err);
          if (failures >= 10) break;
          await new Promise((r) => setTimeout(r, 5_000 * failures));
          continue;
        }
        if (!result) break;
        total += result.processed;
        if (total % 1000 < result.processed) console.log(`[campaign] "${c.name}": ${total} handled, ${result.pending} to go`);
        if (result.done) {
          console.log(`[campaign] "${c.name}" completed`);
          break;
        }
      }
    }
  } finally {
    running = false;
  }
}

/** How long after a campaign finishes its failures are tried again. */
const RETRY_AFTER_MS = 30 * 60_000;

/**
 * One automatic second attempt, 30 minutes after a scheduled campaign
 * finishes: every recipient whose send failed outright, or whose message Meta
 * later reported as not delivered, goes back in the queue once.
 *
 * Waiting matters. Failures arrive by webhook for a while after the last send,
 * and the common ones — a busy network, the marketing cap — do not clear in
 * seconds. Some never clear (a number not on WhatsApp); those simply fail a
 * second time, which costs nothing, as Meta does not charge for failures.
 */
async function queueRetries(): Promise<void> {
  const finished = await db
    .select({ id: campaign.id, name: campaign.name })
    .from(campaign)
    .where(
      and(
        eq(campaign.status, "completed"),
        isNotNull(campaign.scheduledAt),
        isNull(campaign.retriedAt),
        lte(campaign.updatedAt, new Date(Date.now() - RETRY_AFTER_MS)),
      ),
    );

  for (const c of finished) {
    const undelivered = db
      .select({ id: communicationMessage.id })
      .from(communicationMessage)
      .where(eq(communicationMessage.status, "failed"));
    const again = await db
      .update(campaignRecipient)
      .set({ status: "pending", attempts: 2, error: null, updatedAt: new Date() })
      .where(
        and(
          eq(campaignRecipient.campaignId, c.id),
          eq(campaignRecipient.attempts, 1),
          or(eq(campaignRecipient.status, "failed"), inArray(campaignRecipient.messageId, undelivered)),
        ),
      )
      .returning({ id: campaignRecipient.id });

    const now = new Date();
    await db
      .update(campaign)
      .set(
        again.length
          ? { status: "sending", retriedAt: now, scheduledAt: now, updatedAt: now }
          : { retriedAt: now, updatedAt: now },
      )
      .where(eq(campaign.id, c.id));
    console.log(`[campaign] "${c.name}": ${again.length ? `retrying ${again.length} failed` : "nothing to retry"}`);
  }
}

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { contact } from "./schema";
import type * as schema from "./schema";
import { ContactStage } from "./contact-stage";
import { emitDomainEvent } from "./emit-domain-event";
import { DomainEventType } from "./domain-events";
import { routeLead, type LeadFacts, type RoutingResult } from "./lead-routing";

type Db = NodePgDatabase<typeof schema>;

export interface PromotionAttribution {
  source?: string | null;
  sourcePlatform?: string | null;
  campaign?: string | null;
  campaignId?: string | null;
  referralCode?: string | null;
}

/**
 * An AUDIENCE contact (someone we only ever messaged) just enquired — filled
 * a form, messaged us, or staff said so. Makes them a LEAD exactly once:
 * stage, fresh call status, the enquiry's attribution, routing, and
 * LEAD_CAPTURED so the new-lead flow starts for them like for anyone else.
 *
 * Returns null — and changes nothing — for a contact that is not AUDIENCE,
 * so it is safe to call on every enquiry without checking first.
 *
 * Attribution is overwritten, not gap-filled: "CAMPAIGN" only says we once
 * broadcast to this number; the form or ad they came through is where the
 * lead actually came from.
 */
/**
 * A new lead has arrived — say so, once, in both ways a flow can listen for it:
 * LEAD_CAPTURED ("a lead came in") and LEAD_STATUS_NEW ("its status is New").
 *
 * Before, only LEAD_CAPTURED went out when a lead was created; LEAD_STATUS_NEW
 * fired only when a caller picked "New" by hand. A flow triggered on "New"
 * therefore never ran for a fresh lead. Keyed per contact, so every entry
 * point (WhatsApp, form, promotion, CSV import) can call this and a person is
 * still announced exactly once.
 */
export async function announceNewLead(db: Db, contactId: string, payload: Record<string, unknown> = {}) {
  await emitDomainEvent(db, DomainEventType.LEAD_CAPTURED, { contactId, ...payload }, {
    contactId,
    idempotencyKey: `lead_captured:${contactId}`,
  });
  await emitDomainEvent(db, DomainEventType.LEAD_STATUS_NEW, { contactId, from: null, to: "NEW", ...payload }, {
    contactId,
    idempotencyKey: `lead_status_new:${contactId}`,
  });
}

export async function promoteToLead(
  db: Db,
  contactId: string,
  opts: { facts?: LeadFacts; attribution?: PromotionAttribution; reason: string; payload?: Record<string, unknown> },
): Promise<RoutingResult | null> {
  if (!(await markAsLead(db, contactId, opts.attribution ?? {}, opts.reason))) return null;

  const routing = await routeLead(db, contactId, opts.facts ?? {});
  const a = opts.attribution ?? {};
  await announceNewLead(
    db,
    contactId,
    {
      source: a.source ?? "",
      promotedFrom: ContactStage.AUDIENCE,
      reason: opts.reason,
      interest: routing.interest ?? "",
      city: routing.city ?? "",
      assignedUserId: routing.assignedUserId ?? "",
      assignedUserName: routing.assignedUserName ?? "",
      assignedRole: routing.assignedRole ?? "",
      ...opts.payload,
    },
  );
  return routing;
}

/**
 * Just the stage change: AUDIENCE -> LEAD with the enquiry's attribution.
 * For callers that route and emit LEAD_CAPTURED themselves (lead intake).
 * True only if this call did the promoting.
 */
export async function markAsLead(
  db: Db,
  contactId: string,
  a: PromotionAttribution,
  reason: string,
): Promise<boolean> {
  const now = new Date();
  const [promoted] = await db
    .update(contact)
    .set({
      stage: ContactStage.LEAD,
      leadStatus: "NEW",
      leadStatusAt: now,
      lastTouchAt: now,
      updatedAt: now,
      ...(a.source ? { source: a.source } : {}),
      ...(a.sourcePlatform !== undefined ? { sourcePlatform: a.sourcePlatform } : {}),
      ...(a.campaign !== undefined ? { campaign: a.campaign } : {}),
      ...(a.campaignId !== undefined ? { campaignId: a.campaignId } : {}),
      ...(a.referralCode ? { referralCode: a.referralCode } : {}),
    })
    // The WHERE is the guard: two enquiries racing both run this, one wins.
    .where(and(eq(contact.id, contactId), eq(contact.stage, ContactStage.AUDIENCE)))
    .returning({ id: contact.id });
  if (!promoted) return false;

  await emitDomainEvent(
    db,
    DomainEventType.CONTACT_STAGE_CHANGED,
    { contactId, from: ContactStage.AUDIENCE, stage: ContactStage.LEAD, reason },
    { contactId },
  );
  return true;
}

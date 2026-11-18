import "dotenv/config";
import { createServer } from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { db } from "@workspace/db/client";
import {
  communicationMessage,
  communicationConversation,
  contact,
  contactCommunicationPreference,
} from "@workspace/db/schema";
import { eq, sql } from "@workspace/db";
import { normalizePhone } from "@workspace/db/normalize-phone";
import { ContactEngagement, ContactStage } from "@workspace/db/contact-stage";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { ingestLead, recordPendingLead } from "@workspace/db/lead-intake";
import { routeLead } from "@workspace/db/lead-routing";
import { announceNewLead, promoteToLead } from "@workspace/db/lead-promotion";
import { recordHeartbeat } from "@workspace/db/automation-settings";
import { channelByPhoneNumberId } from "@workspace/db/clinic-channel";
import { findActiveFlowsForEvent, findWaitingRunForContact, flowsHandlingButton, replyHasBranch } from "./engine";
import { autoReply } from "./ai/auto-reply";
import { acknowledgeConcern } from "./concern-reply";
import { requestCallbackIfAsked } from "./callback-request";
import { describeInbound, storeInboundMedia, type InboundPayload } from "./inbound-media";
import {
  fetchMetaLead,
  googleLeadToInput,
  websiteLeadToInput,
  type GoogleLeadPayload,
  type MetaLeadgenChange,
} from "./lead-sources";
import { flowQueue } from "./queue";
import { recordCheckinReply } from "./checkins";

const PORT = Number(process.env.PORT ?? 3100);
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
// Lead Ads may live on a different Meta app than WhatsApp; fall back to the
// WhatsApp one when they share an app.
const META_LEADS_VERIFY_TOKEN = process.env.META_LEADS_VERIFY_TOKEN ?? VERIFY_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET ?? APP_SECRET;
const GOOGLE_LEADS_WEBHOOK_KEY = process.env.GOOGLE_LEADS_WEBHOOK_KEY;
const WEBSITE_LEAD_KEY = process.env.WEBSITE_LEAD_KEY;
const WEBSITE_LEAD_ORIGINS = (process.env.WEBSITE_LEAD_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const WHATSAPP_READY = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

interface WhatsAppStatus {
  id: string;
  status: string;
  // Present only on status "failed". Meta puts the actual reason here — the
  // status column alone records *that* a send failed, never *why*, which
  // makes an undeliverable number and a throttled marketing template look
  // identical in the database.
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
}

interface WhatsAppMessage {
  id: string;
  from: string;
  /** Unix seconds. Present on history-sync messages, where it is the point. */
  timestamp?: string;
  type: string;
  text?: { body: string };
  button?: { payload: string; text: string };
  /** On a reply: which of our messages it answers (Meta's id for it). */
  context?: { id?: string; from?: string };
  interactive?: {
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  /**
   * Click-to-WhatsApp. Present on the first message from someone who tapped
   * the button on a Meta ad, and only on that first message — if it is not
   * read here the attribution is gone, and marketing cannot tell which ad
   * paid for which patient.
   */
  referral?: {
    source_type?: string;
    source_id?: string;
    source_url?: string;
    headline?: string;
    body?: string;
    ctwa_clid?: string;
  };
}

/** Replies that mean "leave me alone", never "tell me more". */
const OPT_OUT = /^(stop|unsubscribe|opt ?out|not interested|no thanks?|band karo|mat bhejo)\b/i;

// Meta sends a number's webhooks to one URL per app. Anything else that still
// needs them (the event inbox, while it is in use) is listed here and gets
// the same delivery, byte for byte with Meta's own signature, so it can check
// it exactly as if Meta had called it. Comma separated; empty = no forwarding.
const WHATSAPP_FORWARD_URLS = (process.env.WHATSAPP_WEBHOOK_FORWARD_URLS ?? "")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

function forwardWhatsAppDelivery(rawBytes: Buffer, signature: string | undefined): void {
  for (const target of WHATSAPP_FORWARD_URLS) {
    // Not awaited: a slow or broken target must never hold up our own handling.
    fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(signature ? { "X-Hub-Signature-256": signature } : {}),
      },
      body: new Uint8Array(rawBytes),
      signal: AbortSignal.timeout(10_000),
    })
      .then((r) => {
        if (!r.ok) console.error(`[automation] forward to ${target} answered ${r.status}`);
      })
      .catch((err) => console.error(`[automation] forward to ${target} failed:`, err?.message ?? err));
  }
}

function verifySignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!APP_SECRET) return true; // signature check skipped if not configured
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");
  const provided = signatureHeader.replace("sha256=", "");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

async function findContactByPhone(phone: string) {
  const [row] = await db.select().from(contact).where(eq(contact.phone, phone)).limit(1);
  return row ?? null;
}

/**
 * The person who messaged us, creating them if this is the first we have
 * heard of them.
 *
 * This used to return early on an unknown number and log a warning, which
 * quietly discarded the message. That is not an edge case: it is exactly what
 * every Click-to-WhatsApp lead looks like — a stranger's first message — so
 * the whole point of running ads to this number was being dropped on the
 * floor, visible only in a server log.
 *
 * The referral block is read here rather than later because Meta sends it on
 * the first message only.
 */
async function findOrCreateContactByPhone(
  from: string,
  referral?: WhatsAppMessage["referral"],
  // A stranger messaging us is an enquiry — a LEAD. A chat we find in the
  // phone's history, or one a receptionist starts from the handset, is not:
  // those people are AUDIENCE until they actually ask for something.
  stage: string = ContactStage.LEAD,
  // The clinic whose number they wrote to. With two numbers this is how a
  // Kolkata enquiry becomes a Kolkata lead — before any routing rule runs.
  clinicId?: string | null,
): Promise<{ id: string; created: boolean } | null> {
  // Meta sends digits with country code and no "+". Normalizing anyway, so a
  // number stored by any other write path still matches instead of quietly
  // becoming a second row for the same human.
  const normalized = normalizePhone(from);
  const phone = normalized.ok ? normalized.phone : from;

  const existing = await findContactByPhone(phone);
  if (existing) return { id: existing.id, created: false };

  try {
    const [created] = await db
      .insert(contact)
      .values({
        phone,
        stage,
        clinicId: clinicId ?? null,
        source: referral ? "SOCIAL_MEDIA" : "WHATSAPP",
        sourcePlatform: referral?.source_type ? referral.source_type.toUpperCase() : null,
        campaignId: referral?.source_id ?? null,
        campaign: referral?.headline ?? null,
        referralCode: referral?.ctwa_clid ?? null,
        firstTouchAt: new Date(),
        lastTouchAt: new Date(),
      })
      .returning();
    return created ? { id: created.id, created: true } : null;
  } catch {
    // Two messages arriving together race on contact_phone_unique. The loser
    // reads the winner's row rather than dropping the message.
    const raced = await findContactByPhone(phone);
    return raced ? { id: raced.id, created: false } : null;
  }
}

/**
 * They asked us to stop. Marks them Do Not Contact and writes the consent
 * row that actually gates sending (checkConsent in @workspace/communication
 * reads that row, never the label), leaving transactional replies to things
 * they asked for switched on.
 */
async function optOut(contactId: string, said: string): Promise<void> {
  await db
    .update(contact)
    .set({ engagement: ContactEngagement.DO_NOT_CONTACT, updatedAt: new Date() })
    .where(eq(contact.id, contactId));

  const off = {
    marketing: false,
    appointmentReminders: false,
    medicalReminders: false,
    whatsappEnabled: false,
    emailEnabled: false,
    smsEnabled: false,
    pushEnabled: false,
    updatedAt: new Date(),
  };
  await db
    .insert(contactCommunicationPreference)
    .values({ contactId, ...off })
    .onConflictDoUpdate({ target: contactCommunicationPreference.contactId, set: off });

  await emitDomainEvent(
    db,
    DomainEventType.CONTACT_OPTED_OUT,
    { contactId, said, channel: "whatsapp" },
    { contactId },
  );
  console.log(`[automation] opt-out honoured for contact ${contactId}`);
}

async function ensureConversation(contactId: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(communicationConversation)
    .where(eq(communicationConversation.contactId, contactId))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(communicationConversation)
    .values({ contactId, channel: "whatsapp" })
    .returning();
  return created!.id;
}

async function handleStatus(status: WhatsAppStatus): Promise<void> {
  // The status column records *that* a send failed, never *why*. Meta only
  // ever states the reason here, in this one callback, so log it before it
  // is discarded — otherwise an undeliverable number and a throttled
  // marketing template are indistinguishable in the database.
  if (status.status === "failed") {
    for (const err of status.errors ?? []) {
      console.error(
        `[automation] WhatsApp delivery failed for ${status.id}: ` +
          `[${err.code ?? "?"}] ${err.title ?? ""} ${err.message ?? ""} ${err.error_data?.details ?? ""}`.trim(),
      );
    }
    if (!status.errors?.length) {
      console.error(`[automation] WhatsApp delivery failed for ${status.id}: no reason returned`);
    }
  }

  const [updated] = await db
    .update(communicationMessage)
    .set({ status: status.status })
    .where(eq(communicationMessage.providerMessageId, status.id))
    .returning({ id: communicationMessage.id, contactId: communicationMessage.contactId });

  // "It reached them" is the moment a follow-up flow wants to start from.
  // The column alone cannot trigger anything, so say it out loud once.
  if (updated && status.status === "delivered") {
    await emitDomainEvent(
      db,
      DomainEventType.COMMUNICATION_DELIVERED,
      { contactId: updated.contactId, messageId: updated.id, providerMessageId: status.id },
      { contactId: updated.contactId, idempotencyKey: `communication_delivered:${status.id}` },
    );
  }
}

async function handleInboundMessage(message: WhatsAppMessage, clinicId?: string | null): Promise<void> {
  const contactRow = await findOrCreateContactByPhone(message.from, message.referral, ContactStage.LEAD, clinicId);
  if (!contactRow) {
    console.error(`[automation] could not resolve a contact for ${message.from}`);
    return;
  }

  if (contactRow.created) {
    console.log(
      `[automation] new WhatsApp lead ${message.from}` +
        (message.referral ? ` from ad ${message.referral.source_id ?? "?"}` : ""),
    );
    // Click-to-WhatsApp carries no form, only the ad's headline and body —
    // enough for an "ad" or "campaign" keyword rule to route on.
    const routing = await routeLead(db, contactRow.id, {
      adName: message.referral?.headline ?? null,
      adId: message.referral?.source_id ?? null,
      campaignName: message.referral?.body ?? null,
      source: message.referral ? "SOCIAL_MEDIA" : "WHATSAPP",
      answers: message.text?.body ? { first_message: message.text.body } : {},
    }).catch((err) => {
      console.error("[automation] routing a WhatsApp lead failed:", err);
      return null;
    });
    // LEAD_CAPTURED and LEAD_STATUS_NEW, once per person — see announceNewLead.
    await announceNewLead(
      db,
      contactRow.id,
      {
        source: message.referral ? "SOCIAL_MEDIA" : "WHATSAPP",
        referral: message.referral ?? null,
        interest: routing?.interest ?? "",
        city: routing?.city ?? "",
        assignedUserId: routing?.assignedUserId ?? "",
        assignedUserName: routing?.assignedUserName ?? "",
        assignedRole: routing?.assignedRole ?? "",
      },
    );
  }

  const text = (message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title ?? "").trim();

  // "Stop" has to mean stop. Not promoting them to a lead was never enough:
  // the next campaign would have gone out to them anyway, and the people who
  // get those are the ones who report the number — which costs every future
  // lead, not just this one. So switch consent off for real, the same way the
  // Do Not Contact button in the console does.
  if (OPT_OUT.test(text)) {
    // A number we had never heard of, whose first and only word is "stop",
    // is not a lead — it is somebody we should never have messaged. Creating
    // it as a LEAD would put it on a telecaller's list to chase.
    if (contactRow.created) {
      await db
        .update(contact)
        .set({ stage: ContactStage.AUDIENCE, leadStatus: null, updatedAt: new Date() })
        .where(eq(contact.id, contactRow.id));
    }
    await optOut(contactRow.id, text);
    return;
  }

  // Someone we had only broadcast to wrote back. That is an enquiry.
  if (!contactRow.created) {
    await promoteToLead(db, contactRow.id, {
      reason: "replied on WhatsApp",
      attribution: message.referral
        ? {
            source: "SOCIAL_MEDIA",
            sourcePlatform: message.referral.source_type?.toUpperCase() ?? null,
            campaign: message.referral.headline ?? null,
            campaignId: message.referral.source_id ?? null,
            referralCode: message.referral.ctwa_clid ?? null,
          }
        : { source: "WHATSAPP" },
      facts: {
        adName: message.referral?.headline ?? null,
        adId: message.referral?.source_id ?? null,
        answers: text ? { first_message: text } : {},
      },
    }).catch((err) => console.error("[automation] promoting a WhatsApp reply to a lead failed:", err));
  }

  const [contactClinic] = await db
    .select({ clinicId: contact.clinicId })
    .from(contact)
    .where(eq(contact.id, contactRow.id))
    .limit(1);
  const contactClinicId = contactClinic?.clinicId ?? null;

  const conversationId = await ensureConversation(contactRow.id);
  // A template's QUICK_REPLY button and a dynamic list message (e.g. "pick a
  // date") both come back here as different payload shapes — normalize both
  // to the same buttonId/body pair so everything downstream (Wait for
  // Reply's branch matching, dynamic captureReplyAs) doesn't need to care
  // which kind of button produced the reply.
  const buttonId =
    message.button?.payload ?? message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id;
  const body =
    message.text?.body ??
    message.button?.text ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title;

  // A photo, video, voice note, document, sticker, reaction, location or
  // contact: its caption or summary is the text, the file is fetched below.
  const extra = describeInbound(message as InboundPayload);

  const [stored] = await db
    .insert(communicationMessage)
    .values({
      conversationId,
      contactId: contactRow.id,
      direction: "inbound",
      channel: "whatsapp",
      body: body ?? extra.body,
      variables: extra.media ? { media: extra.media } : {},
      status: "delivered",
      providerMessageId: message.id,
      idempotencyKey: `whatsapp_inbound:${message.id}`,
    })
    .returning({ id: communicationMessage.id });

  // The file itself, in the background — the reply logic below does not wait on a download.
  if (stored && extra.media?.mediaId) {
    void storeInboundMedia(stored.id, extra.media);
  }

  // A daily check-in (medicine, exercise, diet): a tap is the patient's answer for that day.
  // It is fully handled there (recorded, thanked) — nothing below, the AI
  // replier least of all, has anything to add to "Yes, did all".
  if (buttonId) {
    const recorded = await recordCheckinReply({
      contactId: contactRow.id,
      contextId: message.context?.id ?? null,
      text: body,
      buttonId,
    }).catch((err) => {
      console.error("[automation] recording a check-in reply failed:", err);
      return false;
    });
    if (recorded) return;
  }

  if (buttonId) {
    await emitDomainEvent(
      db,
      DomainEventType.COMMUNICATION_BUTTON_CLICKED,
      { contactId: contactRow.id, buttonId, messageId: message.id },
      { contactId: contactRow.id, idempotencyKey: `communication_button_clicked:${message.id}` },
    );
  } else {
    await emitDomainEvent(
      db,
      DomainEventType.COMMUNICATION_REPLIED,
      { contactId: contactRow.id, body, messageId: message.id },
      { contactId: contactRow.id, idempotencyKey: `communication_replied:${message.id}` },
    );
  }

  // If some flow is currently sitting on a "Wait for Reply" node for this
  // contact, this reply is what it's waiting for — resume it directly
  // rather than only relying on a brand-new flow matching the event type.
  const waitingRun = await findWaitingRunForContact(contactRow.id);
  if (waitingRun) {
    await flowQueue.add("reply", {
      kind: "reply",
      runId: waitingRun.id,
      branchKey: buttonId ?? "any_reply",
      replyContext: { lastReplyBody: body ?? null, lastButtonId: buttonId ?? null },
    });
  }

  // "Yes, Call Me" / YES: a call for the lead's telecaller, due in 15 minutes.
  // The chat still gets its answer below.
  await requestCallbackIfAsked({ contactId: contactRow.id, text: body ?? null, buttonId: buttonId ?? null }).catch((err) =>
    console.error("[automation] callback task failed:", err),
  );

  // A tap on Knee pain / Back Pain / Weight Loss / Muscle loss is the
  // welcome template's concern picker. Thank them here. Call Now dials and
  // never arrives as a message. A matching flow still resumes above.
  let concernHandled = false;
  try {
    concernHandled = await acknowledgeConcern({
      contactId: contactRow.id,
      clinicId: contactClinicId,
      text: body ?? null,
      buttonId: buttonId ?? null,
      inboundMessageId: message.id,
    });
  } catch (err) {
    console.error("[automation] concern reply failed:", err);
  }

  // Nothing expected this message: either the flow they are in has no branch
  // for what they said, or no flow reacts to replies at all. That is what the
  // AI replier is for — see ai/auto-reply.ts. Everything above is already
  // stored, so a failure here costs the answer, never the message.
  try {
    const handled = waitingRun
      ? await replyHasBranch(waitingRun.id, buttonId ?? "any_reply")
      : buttonId
        ? (await flowsHandlingButton(buttonId, contactClinicId)).length > 0
        : (await findActiveFlowsForEvent(DomainEventType.COMMUNICATION_REPLIED, contactClinicId)).length > 0;

    if (!handled && !concernHandled) {
      const outcome = await autoReply({
        contactId: contactRow.id,
        incomingText: body ?? "",
        unhandledReason: waitingRun ? "no branch matched the reply" : "no flow handles replies",
      });
      const detail = "reason" in outcome ? ` (${outcome.reason})` : "";
      console.log(`[automation] AI reply for ${message.from}: ${outcome.status}${detail}`);
    }
  } catch (err) {
    console.error("[automation] AI reply failed:", err);
  }
}

/**
 * A message someone sent from the WhatsApp Business app on the phone.
 *
 * Under coexistence the same number is live in the app and on the API, so a
 * receptionist can answer from the handset — and unless that reply is stored
 * here, the CRM shows the customer's question with no answer under it and the
 * next person to open the thread says the same thing again.
 *
 * The echo's `from` is our own number, so the customer is `to`. Recipient,
 * not sender, is what identifies the thread.
 */
async function handleEcho(echo: WhatsAppMessage & { to?: string }, clinicId?: string | null): Promise<void> {
  const customer = echo.to;
  if (!customer) {
    console.warn("[automation] echo with no recipient, ignoring");
    return;
  }

  const contactRow = await findOrCreateContactByPhone(customer, undefined, ContactStage.AUDIENCE, clinicId);
  if (!contactRow) {
    console.error(`[automation] could not resolve a contact for echo to ${customer}`);
    return;
  }

  const body =
    echo.text?.body ??
    echo.button?.text ??
    echo.interactive?.button_reply?.title ??
    echo.interactive?.list_reply?.title;

  // A photo or file sent from the phone shows in the thread like one they sent us.
  const extra = describeInbound(echo as InboundPayload);

  const [stored] = await db
    .insert(communicationMessage)
    .values({
      conversationId: await ensureConversation(contactRow.id),
      contactId: contactRow.id,
      direction: "outbound",
      channel: "whatsapp",
      body: body ?? extra.body,
      variables: extra.media ? { media: extra.media } : {},
      // It left the phone, so it is already sent — there is no queue behind it
      // and no delivery callback of ours to move it along.
      status: "sent",
      providerMessageId: echo.id,
      // sentBy stays null: the app knows which handset, not which staff account.
      idempotencyKey: `whatsapp_echo:${echo.id}`,
      createdAt: echo.timestamp ? new Date(Number(echo.timestamp) * 1000) : undefined,
    })
    .returning({ id: communicationMessage.id });
  if (stored && extra.media?.mediaId) {
    void storeInboundMedia(stored.id, extra.media);
  }
}

/**
 * Chats that already existed on the phone before the number was connected.
 *
 * Coexistence backfills roughly six months of history once, in batches. They
 * are ordinary messages with a timestamp in the past, so they are stored the
 * same way — but nothing may be triggered off them: emitting LEAD_CAPTURED or
 * resuming a waiting flow for a conversation that finished in March would
 * start real automation against months-old chatter.
 */
async function handleHistoryMessage(
  message: WhatsAppMessage & { to?: string },
  fromMe: boolean,
  clinicId?: string | null,
): Promise<void> {
  const counterparty = fromMe ? message.to : message.from;
  if (!counterparty) return;

  const contactRow = await findOrCreateContactByPhone(counterparty, undefined, ContactStage.AUDIENCE, clinicId);
  if (!contactRow) return;

  const body =
    message.text?.body ??
    message.button?.text ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title;

  await db.insert(communicationMessage).values({
    conversationId: await ensureConversation(contactRow.id),
    contactId: contactRow.id,
    direction: fromMe ? "outbound" : "inbound",
    channel: "whatsapp",
    body,
    status: fromMe ? "sent" : "delivered",
    providerMessageId: message.id,
    idempotencyKey: `whatsapp_history:${message.id}`,
    createdAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : undefined,
  });
}

// ===========================================================================
// Lead intake — Meta Lead Ads, Google Ads lead forms, our own website.
// Every path ends in ingestLead(), which owns dedupe and the events that start
// the nurture flows. See WEBHOOK.md for how each provider is pointed here.
// ===========================================================================

function hmacMatches(secret: string, rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.replace("sha256=", "");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

/** The request body, or null if it is larger than `limit` bytes. */
async function readBody(req: IncomingMessage, limit = 256 * 1024): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers }).end(JSON.stringify(body));
}

async function handleMetaLeadgen(change: MetaLeadgenChange): Promise<void> {
  let input;
  try {
    input = await fetchMetaLead(change.leadgen_id, change.page_id);
  } catch (err) {
    // The webhook is the only notice Meta gives — if the fetch fails (token
    // expired, permission missing) the lead would be gone. Park it so
    // `pnpm sync:meta-leads` can finish it once the token is fixed.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[leads] could not fetch Meta lead ${change.leadgen_id}: ${message}`);
    await recordPendingLead(
      db,
      {
        provider: "meta",
        externalId: change.leadgen_id,
        formId: change.form_id ?? null,
        adId: change.ad_id ?? null,
        pageId: change.page_id ?? null,
        raw: change,
        submittedAt: change.created_time ? new Date(change.created_time * 1000) : null,
      },
      message,
    );
    return;
  }
  const result = await ingestLead(db, input);
  console.log(
    `[leads] meta ${change.leadgen_id} -> ${result.status}` + ("reason" in result ? ` (${result.reason})` : ""),
  );
}

// A crude per-IP limit for the public website endpoint — enough to stop one
// script from filling the CRM (and our WhatsApp bill) from one machine.
const websiteHits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (websiteHits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  websiteHits.set(ip, recent);
  if (websiteHits.size > 5000) websiteHits.clear();
  return recent.length > 10;
}

/** CORS headers for an allowed origin; empty for a disallowed one. */
function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin) return {};
  const allowed = WEBSITE_LEAD_ORIGINS.length === 0 || WEBSITE_LEAD_ORIGINS.includes(origin.replace(/\/$/, ""));
  if (!allowed) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Lead-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

async function handleMetaLeadsRoute(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (req.method === "GET") {
    const ok =
      !!META_LEADS_VERIFY_TOKEN &&
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === META_LEADS_VERIFY_TOKEN;
    if (ok) res.writeHead(200).end(url.searchParams.get("hub.challenge") ?? "");
    else res.writeHead(403).end();
    return;
  }
  if (req.method !== "POST") return void res.writeHead(405).end();

  const rawBody = (await readBody(req)) ?? "";
  if (META_APP_SECRET) {
    if (!hmacMatches(META_APP_SECRET, rawBody, req.headers["x-hub-signature-256"] as string | undefined)) {
      return void res.writeHead(401).end();
    }
  } else if (IS_PRODUCTION) {
    // Unsigned, anyone could post a made-up leadgen id. The Graph fetch would
    // fail, but refuse outright rather than lean on that.
    console.error("[leads] META_APP_SECRET not set — refusing Meta lead webhook");
    return void res.writeHead(503).end();
  }

  // 200 first: Meta retries on anything slow or non-2xx, and ingestLead is
  // idempotent on leadgen_id, so a retry is harmless anyway.
  res.writeHead(200).end("ok");

  try {
    const payload = JSON.parse(rawBody);
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "leadgen" || !change.value?.leadgen_id) continue;
        try {
          await handleMetaLeadgen({ page_id: entry.id, ...change.value } as MetaLeadgenChange);
        } catch (err) {
          console.error("[leads] failed to process Meta lead:", err);
        }
      }
    }
  } catch (err) {
    console.error("[leads] bad Meta lead webhook body:", err);
  }
}

async function handleGoogleLeadsRoute(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return void res.writeHead(405).end();
  const rawBody = await readBody(req);
  let body: GoogleLeadPayload;
  try {
    body = JSON.parse(rawBody ?? "");
  } catch {
    return void json(res, 400, { error: "invalid JSON" });
  }
  // Google authenticates with the key typed next to the webhook URL in the
  // lead form, echoed back in the body. With no key configured, refuse —
  // otherwise this is an open door for inventing leads.
  if (!GOOGLE_LEADS_WEBHOOK_KEY || body.google_key !== GOOGLE_LEADS_WEBHOOK_KEY) {
    return void json(res, 401, { error: "bad google_key" });
  }
  if (!body.lead_id) return void json(res, 400, { error: "lead_id missing" });

  try {
    // Answered after the write, not before: a 5xx makes Google retry, and the
    // form's "Send test data" button shows our response to whoever set it up.
    const result = await ingestLead(db, googleLeadToInput(body));
    console.log(`[leads] google ${body.lead_id} -> ${result.status}`);
    json(res, 200, { ok: true });
  } catch (err) {
    console.error("[leads] failed to process Google lead:", err);
    json(res, 500, { error: "internal" });
  }
}

async function handleWebsiteLeadsRoute(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin as string | undefined;
  const cors = corsHeaders(origin);
  const originRejected = !!origin && !cors["Access-Control-Allow-Origin"];

  if (req.method === "OPTIONS") return void res.writeHead(originRejected ? 403 : 204, cors).end();
  if (req.method !== "POST") return void res.writeHead(405, cors).end();
  if (originRejected) return void json(res, 403, { error: "origin not allowed" });

  const rawBody = await readBody(req, 64 * 1024);
  if (rawBody === null) return void json(res, 413, { error: "too large" }, cors);

  let body: Record<string, unknown>;
  try {
    const type = String(req.headers["content-type"] ?? "");
    body = type.includes("application/x-www-form-urlencoded")
      ? Object.fromEntries(new URLSearchParams(rawBody))
      : JSON.parse(rawBody || "{}");
  } catch {
    return void json(res, 400, { error: "invalid body" }, cors);
  }

  // Server-to-server posts (a Next.js route handler, Zapier) authenticate with
  // the key; browser posts are held to the allowed origins instead.
  const key = (req.headers["x-lead-key"] as string | undefined) ?? (body.key as string | undefined);
  if (WEBSITE_LEAD_KEY && !origin && key !== WEBSITE_LEAD_KEY) return void json(res, 401, { error: "bad key" });

  const ip = String(req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "")
    .split(",")[0]!
    .trim();
  if (rateLimited(ip)) return void json(res, 429, { error: "too many submissions" }, cors);

  // Honeypot: a hidden field real people never fill. Bots get an ordinary
  // success so they do not learn to skip it.
  if (body.website || body._hp) return void json(res, 200, { ok: true }, cors);

  const externalId =
    typeof body.submissionId === "string" && body.submissionId ? body.submissionId.slice(0, 100) : randomUUID();
  const input = websiteLeadToInput(body, externalId);
  if (!input.phone && !input.email) return void json(res, 400, { error: "phone or email is required" }, cors);

  try {
    const result = await ingestLead(db, input);
    console.log(`[leads] website ${externalId} -> ${result.status}`);
    if (result.status === "unmatched") return void json(res, 400, { error: result.reason }, cors);
    json(res, 200, { ok: true }, cors);
  } catch (err) {
    console.error("[leads] failed to process website lead:", err);
    json(res, 500, { error: "internal" }, cors);
  }
}

/**
 * "Is this thing working?" — for a load balancer, and for a human at 11pm.
 *
 * A webhook server that answers "ok" while the database is unreachable is
 * worse than one that is down: leads are being accepted and dropped.
 */
async function health(res: ServerResponse): Promise<void> {
  let database = "ok";
  try {
    await db.execute(sql`select 1`);
    await recordHeartbeat(db, "webhook");
  } catch (err) {
    database = err instanceof Error ? err.message : "unreachable";
  }
  const ok = database === "ok";
  json(res, ok ? 200 : 503, {
    status: ok ? "ok" : "degraded",
    database,
    whatsapp: WHATSAPP_READY ? "configured" : "missing token",
    metaLeads: process.env.META_PAGE_ACCESS_TOKEN ? "configured" : "no page token",
    googleLeads: GOOGLE_LEADS_WEBHOOK_KEY ? "configured" : "no key",
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  try {
    if (url.pathname === "/webhooks/meta-leads") return await handleMetaLeadsRoute(req, res, url);
    if (url.pathname === "/webhooks/google-leads") return await handleGoogleLeadsRoute(req, res);
    if (url.pathname === "/webhooks/website-leads") return await handleWebsiteLeadsRoute(req, res);
    if (url.pathname === "/healthz") return void (await health(res));
  } catch (err) {
    console.error(`[leads] ${url.pathname} crashed:`, err);
    if (!res.headersSent) res.writeHead(500).end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/webhooks/whatsapp") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      res.writeHead(200).end(challenge ?? "");
    } else {
      res.writeHead(403).end();
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/webhooks/whatsapp") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const rawBytes = Buffer.concat(chunks);
    const rawBody = rawBytes.toString("utf8");
    const signature = req.headers["x-hub-signature-256"] as string | undefined;

    if (!verifySignature(rawBody, signature)) {
      res.writeHead(401).end();
      return;
    }

    // Always 200 immediately — Meta retries aggressively on non-2xx, and
    // idempotencyKey on both communicationMessage and lifecycleEvent makes a
    // retried delivery a safe no-op, so there's no need to hold the
    // connection open while we process.
    res.writeHead(200).end("ok");

    forwardWhatsAppDelivery(rawBytes, signature);

    try {
      const payload = JSON.parse(rawBody);
      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          // Which of our numbers did this arrive on? That is the clinic it
          // belongs to. Unknown number (or only one configured) falls back to
          // the routing rules deciding, as before.
          const arrivedOn = change.value?.metadata?.phone_number_id as string | undefined;
          const channel = arrivedOn ? await channelByPhoneNumberId(db, arrivedOn) : null;
          const clinicId = channel?.channel.clinicId ?? null;

          // Each status/message is isolated: one webhook delivery can carry
          // several, and a Meta retry makes the first one throw on the
          // inbound idempotencyKey unique index. A single try around the
          // whole loop would let that expected duplicate silently swallow
          // every *new* message batched behind it.
          for (const status of change.value?.statuses ?? []) {
            try {
              await handleStatus(status as WhatsAppStatus);
            } catch (err) {
              console.error("[automation] failed to process WhatsApp status:", err);
            }
          }
          // Coexistence: the same number is live on the handset and on the
          // API. A reply typed on the phone arrives as an echo, and the
          // first connection backfills months of past chats. Both are
          // stored, never acted on — see handleEcho/handleHistoryMessage.
          for (const echo of change.value?.message_echoes ?? []) {
            try {
              await handleEcho(echo as WhatsAppMessage & { to?: string }, clinicId);
            } catch (err) {
              console.error("[automation] failed to process WhatsApp echo:", err);
            }
          }

          if (change.field === "history") {
            for (const chunk of change.value?.history ?? []) {
              for (const thread of chunk?.threads ?? []) {
                for (const message of thread?.messages ?? []) {
                  try {
                    await handleHistoryMessage(
                      message as WhatsAppMessage & { to?: string },
                      message?.from_me === true || message?.from === change.value?.metadata?.display_phone_number,
                      clinicId,
                    );
                  } catch (err) {
                    console.error("[automation] failed to store a history message:", err);
                  }
                }
              }
            }
            continue;
          }

          for (const message of change.value?.messages ?? []) {
            try {
              await handleInboundMessage(message as WhatsAppMessage, clinicId);
            } catch (err) {
              console.error("[automation] failed to process WhatsApp message:", err);
            }
          }
        }
      }
    } catch (err) {
      console.error("[automation] failed to process WhatsApp webhook:", err);
    }
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, () => {
  console.log(`[automation] webhook server listening on :${PORT}`);
  // Proof of life for Settings → "Is it running?". It used to be written
  // only when someone opened /healthz, so a server that had been up for days
  // read as "NOT running · last seen 51 h ago".
  const beat = () => recordHeartbeat(db, "webhook").catch(() => {});
  beat();
  setInterval(beat, 30_000);
});

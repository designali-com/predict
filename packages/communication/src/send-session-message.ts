import { db } from "@workspace/db/client";
import {
  communicationConversation,
  communicationMessage,
  contact,
} from "@workspace/db/schema";
import { eq, and } from "@workspace/db";
import {
  sendWhatsAppText,
  sendWhatsAppInteractiveList,
  sendWhatsAppReplyButtons,
  type ListOption,
  type ReplyButton,
} from "./adapters/whatsapp";
import type { SendResult } from "./adapters/types";
import { channelForClinic } from "@workspace/db/clinic-channel";

export interface SendTextMessageParams {
  contactId: string;
  body: string;
  /** Written by the AI replier — flagged on the row so the cap can count it. */
  aiGenerated?: boolean;
  /** The automation run that produced this, for the run timeline. */
  runId?: string;
  /** Set when a staff member typed this in the conversation view. */
  sentBy?: string;
  /** Same key on a webhook retry sends the text once. */
  idempotencyKey?: string;
}

export interface SendInteractiveListMessageParams {
  contactId: string;
  bodyText: string;
  buttonLabel: string;
  options: ListOption[];
  runId?: string;
  sentBy?: string;
}

export interface SessionMessageResult {
  status: string;
  messageId: string;
  error?: string;
}

async function ensureWhatsappConversation(contactId: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(communicationConversation)
    .where(
      and(
        eq(communicationConversation.contactId, contactId),
        eq(communicationConversation.channel, "whatsapp"),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(communicationConversation)
    .values({ contactId, channel: "whatsapp" })
    .returning();
  return created!.id;
}

/**
 * Shared plumbing for the two session-window senders: resolve the contact's
 * phone, log the outbound row, call Meta, then write the outcome back. No
 * consent check — unlike sendCommunication these only ever go out as a
 * direct reply inside a conversation the patient started, so the marketing
 * /reminder preferences don't apply.
 */
async function sendAndLog(
  contactId: string,
  attribution: { runId?: string; sentBy?: string; aiGenerated?: boolean; idempotencyKey?: string },
  bodyForLog: string,
  variables: Record<string, unknown>,
  dispatch: (to: string, sender: { phoneNumberId: string; accessToken: string } | null) => Promise<SendResult>,
): Promise<SessionMessageResult> {
  const [contactRow] = await db
    .select()
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);
  if (!contactRow) throw new Error(`Contact ${contactId} not found`);
  if (!contactRow.phone) throw new Error(`Contact ${contactId} has no phone on file`);

  const conversationId = await ensureWhatsappConversation(contactId);

  if (attribution.idempotencyKey) {
    const [prior] = await db
      .select({ id: communicationMessage.id, status: communicationMessage.status })
      .from(communicationMessage)
      .where(eq(communicationMessage.idempotencyKey, attribution.idempotencyKey))
      .limit(1);
    if (prior) return { status: prior.status, messageId: prior.id };
  }

  const [message] = await db
    .insert(communicationMessage)
    .values({
      conversationId,
      contactId,
      direction: "outbound",
      channel: "whatsapp",
      body: bodyForLog,
      variables,
      status: "queued",
      runId: attribution.runId,
      sentBy: attribution.sentBy,
      aiGenerated: attribution.aiGenerated ?? false,
      idempotencyKey: attribution.idempotencyKey,
    })
    .returning();

  // Replies leave from the number that clinic owns — the one the person
  // messaged in the first place.
  const sending = await channelForClinic(db, contactRow.clinicId);
  if (sending) {
    await db
      .update(communicationMessage)
      .set({ clinicChannelId: sending.channel.id })
      .where(eq(communicationMessage.id, message!.id));
  }

  const result = await dispatch(
    contactRow.phone,
    sending?.accessToken ? { phoneNumberId: sending.phoneNumberId, accessToken: sending.accessToken } : null,
  );

  // Session messages fail for one dominant reason — the contact's 24h
  // window has closed — and the run deliberately carries on rather than
  // failing. Without this line that silent continue is the only symptom.
  if (result.status === "failed") {
    console.error(
      `[communication] whatsapp session send failed — contact ${contactId}, ` +
        `message ${message!.id}: ${result.error ?? "no reason returned"}`,
    );
  }

  await db
    .update(communicationMessage)
    .set({ status: result.status, providerMessageId: result.providerMessageId })
    .where(eq(communicationMessage.id, message!.id));

  await db
    .update(communicationConversation)
    .set({ lastMessageAt: new Date() })
    .where(eq(communicationConversation.id, conversationId));

  return { status: result.status, messageId: message!.id, error: result.error };
}

/**
 * Free-form WhatsApp text, no WABA template involved — valid only inside the
 * contact's open 24h session (e.g. a booking confirmation right after the
 * patient tapped a slot).
 */
export async function sendTextMessage(
  params: SendTextMessageParams,
): Promise<SessionMessageResult> {
  return sendAndLog(
    params.contactId,
    { runId: params.runId, sentBy: params.sentBy, aiGenerated: params.aiGenerated, idempotencyKey: params.idempotencyKey },
    params.body,
    {},
    (to, sender) => sendWhatsAppText(to, params.body, sender),
  );
}

/**
 * Up to three tap replies inside the open 24h window. No template approval.
 */
export async function sendReplyButtonsMessage(params: {
  contactId: string;
  bodyText: string;
  buttons: ReplyButton[];
  runId?: string;
  idempotencyKey?: string;
}): Promise<SessionMessageResult> {
  const labels = params.buttons.map((button) => button.title).join(" · ");
  return sendAndLog(
    params.contactId,
    { runId: params.runId, idempotencyKey: params.idempotencyKey },
    `${params.bodyText}\n${labels}`,
    { buttons: params.buttons },
    (to, sender) => sendWhatsAppReplyButtons(to, { bodyText: params.bodyText, buttons: params.buttons }, sender),
  );
}

/**
 * A WhatsApp list message whose options are computed per-run (open dates,
 * open time slots) and so can't be a pre-approved template. Session-only,
 * same 24h rule as sendTextMessage.
 */
export async function sendInteractiveListMessage(
  params: SendInteractiveListMessageParams,
): Promise<SessionMessageResult> {
  return sendAndLog(
    params.contactId,
    { runId: params.runId, sentBy: params.sentBy },
    params.bodyText,
    { options: params.options },
    (to) =>
      sendWhatsAppInteractiveList(to, {
        bodyText: params.bodyText,
        buttonLabel: params.buttonLabel,
        options: params.options,
      }),
  );
}

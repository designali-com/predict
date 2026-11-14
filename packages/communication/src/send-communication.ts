import { db } from "@workspace/db/client";
import {
  communicationTemplate,
  communicationConversation,
  communicationMessage,
  contactCommunicationPreference,
  contact,
  clinic,
} from "@workspace/db/schema";
import { eq, and } from "@workspace/db";
import { whatsappAdapter } from "./adapters/whatsapp";
import { emailAdapter } from "./adapters/email";
import { smsAdapter, pushAdapter, voiceAdapter } from "./adapters/unimplemented";
import type { ChannelAdapter } from "./adapters/types";
import { orderTemplateVariables, resolveTemplateBody, templatePlaceholders } from "./template-body";
import { channelForClinic } from "@workspace/db/clinic-channel";
import { templateChannel } from "@workspace/db/schema";

const ADAPTERS: Record<string, ChannelAdapter> = {
  whatsapp: whatsappAdapter,
  email: emailAdapter,
  sms: smsAdapter,
  push: pushAdapter,
  voice: voiceAdapter,
};

const CATEGORY_TO_PREFERENCE_FIELD = {
  marketing: "marketing",
  appointmentReminders: "appointmentReminders",
  medicalReminders: "medicalReminders",
  transactional: "transactional",
} as const;

const CHANNEL_TO_PREFERENCE_FIELD = {
  whatsapp: "whatsappEnabled",
  email: "emailEnabled",
  sms: "smsEnabled",
  push: "pushEnabled",
} as const;

export interface SendCommunicationParams {
  contactId: string;
  templateKey: string;
  variables?: Record<string, unknown>;
  channel?: string;
  /** Set when a staff member is sending this manually, not a flow. */
  sentBy?: string;
  /** Set when an automation flow run is sending this, for the run timeline. */
  runId?: string;
  idempotencyKey?: string;
  /** Values for link buttons ending in a variable, in button order — see SendParams. */
  buttonParameters?: string[];
  /** This send's photo/video/PDF for a media-header template, instead of the template's default. */
  headerMediaUrl?: string;
  /**
   * The file is this person's own (an exercise sheet, a report): refuse rather
   * than fall back to the template's approval sample, which is somebody
   * else's example ("Rahul") and must never reach a patient.
   */
  requireHeaderMedia?: boolean;
}

export interface SendCommunicationResult {
  status: string;
  messageId: string;
  /** The provider's reason when status is "failed". communicationMessage has
   * no error column, so this return value and the log line in the sender are
   * the only places the "why" survives. */
  error?: string;
}

const POSTGRES_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } } | undefined)?.cause;
  return cause?.code === POSTGRES_UNIQUE_VIOLATION;
}

/**
 * Inserts a communicationMessage row, or returns the existing one if
 * idempotencyKey was already used (e.g. a retried webhook/flow step) —
 * never sends the same message twice for the same key.
 */
async function insertMessageIdempotent(
  values: typeof communicationMessage.$inferInsert,
): Promise<{ row: typeof communicationMessage.$inferSelect; wasExisting: boolean }> {
  try {
    const [row] = await db.insert(communicationMessage).values(values).returning();
    return { row: row!, wasExisting: false };
  } catch (err) {
    if (isUniqueViolation(err) && values.idempotencyKey) {
      const [existing] = await db
        .select()
        .from(communicationMessage)
        .where(eq(communicationMessage.idempotencyKey, values.idempotencyKey))
        .limit(1);
      if (existing) return { row: existing, wasExisting: true };
    }
    throw err;
  }
}

async function ensureConversation(contactId: string, channel: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(communicationConversation)
    .where(
      and(
        eq(communicationConversation.contactId, contactId),
        eq(communicationConversation.channel, channel),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(communicationConversation)
    .values({ contactId, channel })
    .returning();
  return created!.id;
}

async function checkConsent(
  contactId: string,
  category: string,
  channel: string,
): Promise<boolean> {
  const [prefs] = await db
    .select()
    .from(contactCommunicationPreference)
    .where(eq(contactCommunicationPreference.contactId, contactId))
    .limit(1);

  // No row yet = default opt-in on every category/channel.
  if (!prefs) return true;

  const categoryField =
    CATEGORY_TO_PREFERENCE_FIELD[category as keyof typeof CATEGORY_TO_PREFERENCE_FIELD];
  const channelField =
    CHANNEL_TO_PREFERENCE_FIELD[channel as keyof typeof CHANNEL_TO_PREFERENCE_FIELD];

  const categoryAllowed = categoryField ? prefs[categoryField] : true;
  const channelAllowed = channelField ? prefs[channelField] : true;
  return categoryAllowed && channelAllowed;
}

/**
 * The single entry point for sending a patient a message on any channel —
 * called by the automation flow engine's "Send Communication" node and by
 * staff's manual "send message" action in the patient profile UI alike.
 * Checks consent, logs to communicationMessage regardless of outcome, and
 * dispatches to the channel adapter.
 */
/**
 * The clinic's own version of a template, when it has one: "diet_checkin__optm"
 * for OPTM's patients. An approved WhatsApp template's wording cannot change,
 * so a clinic that wants its own name on a message gets its own copy, approved
 * on its own; until then its patients get the shared one.
 */
async function clinicVariant(templateKey: string, contactId: string) {
  const [owner] = await db
    .select({ slug: clinic.slug })
    .from(contact)
    .innerJoin(clinic, eq(clinic.id, contact.clinicId))
    .where(eq(contact.id, contactId))
    .limit(1);
  if (!owner?.slug) return null;
  const [variant] = await db
    .select()
    .from(communicationTemplate)
    .where(
      and(
        eq(communicationTemplate.key, `${templateKey}__${owner.slug}`),
        eq(communicationTemplate.submissionStatus, "approved"),
      ),
    )
    .limit(1);
  return variant ?? null;
}

export async function sendCommunication(
  params: SendCommunicationParams,
): Promise<SendCommunicationResult> {
  const [shared] = await db
    .select()
    .from(communicationTemplate)
    .where(eq(communicationTemplate.key, params.templateKey))
    .limit(1);
  if (!shared) {
    throw new Error(`Unknown communication template "${params.templateKey}"`);
  }
  const template = (await clinicVariant(shared.key, params.contactId)) ?? shared;

  const channel = params.channel ?? template.channel;
  const variables = params.variables ?? {};
  const conversationId = await ensureConversation(params.contactId, channel);

  const allowed = await checkConsent(params.contactId, template.category, channel);
  if (!allowed) {
    const { row } = await insertMessageIdempotent({
      conversationId,
      contactId: params.contactId,
      direction: "outbound",
      channel,
      templateId: template.id,
      variables,
      status: "skipped_no_consent",
      sentBy: params.sentBy,
      runId: params.runId,
      idempotencyKey: params.idempotencyKey,
    });
    return { status: "skipped_no_consent", messageId: row.id };
  }

  const [contactRow] = await db
    .select()
    .from(contact)
    .where(eq(contact.id, params.contactId))
    .limit(1);
  if (!contactRow) throw new Error(`Contact ${params.contactId} not found`);

  const to = channel === "email" ? contactRow.email : contactRow.phone;
  if (!to) {
    throw new Error(`Contact ${params.contactId} has no ${channel === "email" ? "email" : "phone"} on file`);
  }

  if (
    params.requireHeaderMedia &&
    (!params.headerMediaUrl?.trim() || params.headerMediaUrl === template.headerMediaUrl)
  ) {
    throw new Error(`"${template.key}" needs this patient's own file — refusing to send the template's sample`);
  }

  // Resolve the template once, up front: the adapter needs the positional
  // values and the conversation view needs the rendered text.
  const templateParameters = orderTemplateVariables(template.variablesSchema, variables);
  // Templates made in the builder are saved with no variablesSchema even when
  // the body says "Hi {{1}}", so nothing was passed for {{1}} and Meta refused
  // every send ("(#132000) Number of parameters does not match"). {{1}} is the
  // person's name in every template here; fill it from the contact when the
  // caller did not. A later placeholder with no value is left for Meta to
  // refuse loudly rather than guessed at. A schema of ["name"] with no name
  // passed (the daily check-ins) gives [""], which Meta refuses just the same
  // ("(#131008) Required parameter is missing"), so a blank {{1}} is filled too.
  const expected = templatePlaceholders(template.bodyText).length;
  const fallbackName = contactRow.name?.trim() || "there";
  if (expected > 0 && templateParameters.length === 0) {
    templateParameters.push(fallbackName);
  } else if (expected > 0 && !templateParameters[0]?.trim()) {
    templateParameters[0] = fallbackName;
  }
  const resolvedBody = resolveTemplateBody(template.bodyText, templateParameters);

  // The file this send carries, kept on the message. The thread used to show
  // the template's approval sample (the exercise plan read as "Rahul's"
  // exercise-prescription-sample.pdf) because which file went was never kept.
  const headerKind = ({ IMAGE: "image", VIDEO: "video", DOCUMENT: "document" } as Record<string, string>)[template.headerType ?? ""];
  const storedVariables =
    headerKind && params.headerMediaUrl
      ? {
          ...variables,
          media: {
            kind: headerKind,
            url: params.headerMediaUrl,
            name: decodeURIComponent(params.headerMediaUrl.split("?")[0]?.split("/").pop() ?? "").replace(/^[a-f0-9]{16}-/i, ""),
            ...(headerKind === "document" ? { mime: "application/pdf" } : {}),
          },
        }
      : variables;

  const { row: message, wasExisting } = await insertMessageIdempotent({
    conversationId,
    contactId: params.contactId,
    direction: "outbound",
    channel,
    templateId: template.id,
    variables: storedVariables,
    body: resolvedBody,
    status: "queued",
    sentBy: params.sentBy,
    runId: params.runId,
    idempotencyKey: params.idempotencyKey,
  });
  if (wasExisting) {
    return { status: message.status, messageId: message.id };
  }

  const adapter = ADAPTERS[channel];
  if (!adapter) throw new Error(`No adapter registered for channel "${channel}"`);

  // Which number this clinic sends from. One number serves every clinic until
  // one of them gets its own; from then on a Kolkata patient hears from the
  // Kolkata number, which is also the number they can reply to.
  const sending = channel === "whatsapp" ? await channelForClinic(db, contactRow.clinicId) : null;
  let providerTemplateName = template.providerTemplateName;

  if (sending) {
    // A template is approved per WhatsApp business account. With two numbers
    // the same template can be live on one and pending on the other, so the
    // per-number row wins where it exists.
    const [perChannel] = await db
      .select()
      .from(templateChannel)
      .where(and(eq(templateChannel.templateId, template.id), eq(templateChannel.clinicChannelId, sending.channel.id)))
      .limit(1);

    if (perChannel) {
      if (perChannel.submissionStatus !== "approved") {
        // Refuse here rather than let Meta refuse it: the Graph error for an
        // unapproved template is opaque, and this way the reason names the
        // number it is unapproved on.
        const reason = `"${template.key}" is ${perChannel.submissionStatus} on ${sending.channel.displayNumber ?? "this number"}`;
        await db
          .update(communicationMessage)
          .set({ status: "failed" })
          .where(eq(communicationMessage.id, message.id));
        console.error(`[communication] ${reason}`);
        return { status: "failed", messageId: message.id, error: reason };
      }
      providerTemplateName = perChannel.providerTemplateName ?? providerTemplateName;
    }

    if (sending.missingToken) {
      console.error(
        `[communication] no access token for ${sending.channel.displayNumber ?? sending.phoneNumberId} ` +
          `(env ${sending.channel.tokenEnvVar ?? "WHATSAPP_ACCESS_TOKEN"})`,
      );
    }

    await db
      .update(communicationMessage)
      .set({ clinicChannelId: sending.channel.id })
      .where(eq(communicationMessage.id, message.id));
  }

  const result = await adapter.send({
    to,
    templateKey: template.key,
    providerTemplateName,
    language: template.language,
    headerType: template.headerType,
    headerMediaUrl: params.headerMediaUrl || template.headerMediaUrl,
    variables,
    templateParameters,
    ctaButtons: template.ctaButtons,
    buttonParameters: params.buttonParameters,
    sender:
      sending && sending.accessToken
        ? { phoneNumberId: sending.phoneNumberId, accessToken: sending.accessToken }
        : null,
    renderedSubject: resolveTemplateBody(template.headerText, templateParameters),
    renderedBody: [resolvedBody, template.footerText].filter(Boolean).join("\n\n") || null,
  });

  // A failed Graph call is otherwise invisible: the row just reads "failed"
  // and Meta's reason (template not approved, 24h window closed, number not
  // on WhatsApp) is dropped on the floor. Log it so the worker output
  // actually explains why a message never arrived.
  if (result.status === "failed") {
    console.error(
      `[communication] ${channel} send failed — contact ${params.contactId}, ` +
        `template "${template.key}", message ${message.id}: ${result.error ?? "no reason returned"}`,
    );
  }

  await db
    .update(communicationMessage)
    .set({
      status: result.status,
      providerMessageId: result.providerMessageId,
    })
    .where(eq(communicationMessage.id, message.id));

  await db
    .update(communicationConversation)
    .set({ lastMessageAt: new Date() })
    .where(eq(communicationConversation.id, conversationId));

  return { status: result.status, messageId: message.id, error: result.error };
}

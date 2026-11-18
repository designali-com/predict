import { generateText } from "ai";
import { db } from "@workspace/db/client";
import {
  aiReplyConfig,
  communicationConversation,
  communicationMessage,
  contact,
  leadRule,
  task,
  user,
} from "@workspace/db/schema";
import { and, asc, desc, eq, gte, isNotNull, sql } from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { sendTextMessage } from "@workspace/communication";
import { modelFor, MissingApiKeyError } from "./model";

/**
 * The reply nothing else had an answer for.
 *
 * A template goes out, the person writes back, and the flow they are in has
 * no branch for what they said — or they are in no flow at all. Before this,
 * that message sat unanswered until somebody opened the inbox, which on a
 * WhatsApp enquiry is usually hours and often the next day.
 *
 * Three rules shape everything here:
 *   1. It only ever answers from the clinic's own written information. No
 *      medical advice, no invented prices, no promises about results.
 *   2. It hands over the moment it is unsure, and says so to the person.
 *   3. It stays out of the way of a human: if staff have answered recently,
 *      it says nothing at all.
 */

const MAX_HISTORY = 14;

export type AutoReplyOutcome =
  | { status: "sent"; messageId: string; handoff: boolean; text: string }
  | { status: "handoff"; reason: string }
  | { status: "skipped"; reason: string };

export interface ReplyDecision {
  /** The WhatsApp message to send back. */
  reply: string;
  /** A person from the clinic must take this over. */
  handoff: boolean;
  handoffReason: string;
  /** Two or three words: book appointment, price, timings, complaint... */
  intent: string;
}

const OUTPUT_RULES = [
  "",
  "Answer with one JSON object and nothing else — no markdown, no code fence, no commentary:",
  '{"reply": "<the WhatsApp message>", "handoff": <true|false>, "handoffReason": "<why a person is needed, or empty>", "intent": "<two or three words>"}',
].join("\n");

/**
 * The model's JSON, however it wrapped it.
 *
 * Structured-output mode is not portable: the same prompt that works on one
 * model comes back from another as a fenced block or with a sentence in
 * front, and the SDK then throws "could not parse the response" — which for
 * us means a lead gets silence. So we ask for JSON in the prompt and read it
 * leniently here; anything we cannot read becomes a hand-over, never a guess.
 */
export function parseDecision(raw: string): ReplyDecision | null {
  const text = raw.trim().replace(/^\u0060{3}(?:json)?/i, "").replace(/\u0060{3}$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const o = parsed as Record<string, unknown>;
  const reply = typeof o.reply === "string" ? o.reply.trim() : "";
  if (!reply) return null;
  return {
    reply,
    handoff: o.handoff === true || o.handoff === "true",
    handoffReason: typeof o.handoffReason === "string" ? o.handoffReason : "",
    intent: typeof o.intent === "string" ? o.intent : "other",
  };
}

/** The safety rules. Not editable from the admin screen — only added to. */
function systemPrompt(args: {
  businessInfo: string;
  instructions: string;
  contactName: string | null;
  city: string | null;
  icp: string | null;
  leadStatus: string | null;
  ownerName: string | null;
}): string {
  return [
    "You answer WhatsApp messages for a Predict physiotherapy clinic in India, on behalf of the clinic's team.",
    "",
    "Hard rules, in order of importance:",
    "1. Never give medical advice, a diagnosis, a treatment plan, or an opinion on someone's condition, scan or medicine. For anything clinical, say the physiotherapist will advise after an assessment, and hand over.",
    "2. State only facts given in CLINIC INFORMATION below. If a price, timing, address, doctor's name or offer is not written there, do not guess and do not approximate — set handoff to true and tell the person the team will confirm.",
    "3. Never promise a cure, a result, or a timeline for recovery.",
    "4. Keep it short: at most 3 short sentences, no bullet points, no markdown, no links unless they appear in CLINIC INFORMATION.",
    "5. Reply in the language the person wrote in, every time. English in, English out — never answer an English message in Hinglish. Hinglish in, Hinglish out. Hindi in, Hindi out, in their script.",
    "6. Sound like a person from the clinic, not a bot. Never say you are an AI, never apologise repeatedly.",
    "7. Your aim is one thing: get them to book an assessment, or agree to a call from the team.",
    "8. If they are angry, complaining, asking for a refund, or mention a bad experience, do not argue — apologise once, say a team member will call, and hand over.",
    "9. If you set handoff to true, your reply must still be a natural holding message ('team aapko thodi der mein call karegi'), never an explanation of your own limits.",
    "",
    "CLINIC INFORMATION (the only facts you may state):",
    args.businessInfo.trim() || "(nothing written yet — you may not state any fact. Hand over instead.)",
    "",
    args.instructions.trim() ? `HOUSE STYLE:\n${args.instructions.trim()}` : "",
    "",
    "WHO YOU ARE TALKING TO:",
    `Name: ${args.contactName ?? "unknown"}`,
    `City: ${args.city ?? "unknown"}`,
    `What their enquiry was about: ${args.icp?.replace(/_/g, " ") ?? "unknown"}`,
    `Where they are in our follow-up: ${args.leadStatus ?? "new"}`,
    args.ownerName ? `The person from our team who handles them: ${args.ownerName}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Answers one inbound message, or explains why it did not. Never throws —
 * an inbound WhatsApp message must be stored and acknowledged whatever the
 * model does.
 */
export async function autoReply(params: {
  contactId: string;
  /** What they just said. A button's title counts. */
  incomingText: string;
  /** Why nothing else handled it, for the event log. */
  unhandledReason: string;
  /** What this step of a flow wants said. Added to the rules, never over them. */
  extraInstructions?: string;
}): Promise<AutoReplyOutcome> {
  const text = params.incomingText.trim();
  if (!text) return { status: "skipped", reason: "nothing to answer (media or empty message)" };

  const [contactRow] = await db.select().from(contact).where(eq(contact.id, params.contactId)).limit(1);
  if (!contactRow) return { status: "skipped", reason: "contact not found" };

  // Each clinic answers with its own facts, its own tone and its own limits.
  const config = await aiConfigFor(contactRow.clinicId);
  if (!config || !config.enabled) return { status: "skipped", reason: "AI replies are switched off" };
  if (contactRow.engagement === "DO_NOT_CONTACT") {
    return { status: "skipped", reason: "contact is marked do not contact" };
  }

  // A caller mid-conversation must not be talked over.
  const takeoverSince = new Date(Date.now() - config.humanTakeoverMinutes * 60_000);
  const [humanReply] = await db
    .select({ id: communicationMessage.id })
    .from(communicationMessage)
    .where(
      and(
        eq(communicationMessage.contactId, params.contactId),
        eq(communicationMessage.direction, "outbound"),
        isNotNull(communicationMessage.sentBy),
        gte(communicationMessage.createdAt, takeoverSince),
      ),
    )
    .limit(1);
  if (humanReply) {
    return { status: "skipped", reason: `a person replied in the last ${config.humanTakeoverMinutes} minutes` };
  }

  // The cap is per day per person: whatever goes wrong, nobody gets talked at
  // forever by a machine.
  const [{ used } = { used: 0 }] = await db
    .select({ used: sql<number>`count(*)::int` })
    .from(communicationMessage)
    .where(
      and(
        eq(communicationMessage.contactId, params.contactId),
        eq(communicationMessage.aiGenerated, true),
        gte(communicationMessage.createdAt, startOfToday()),
      ),
    );
  if (used >= config.dailyLimitPerContact) {
    await raiseHandoff(config, contactRow, "daily AI reply limit reached", text);
    return { status: "handoff", reason: "daily limit reached — handed to the team" };
  }

  // Some things are never for a machine to answer, whatever the model thinks.
  const keywords = config.handoffKeywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (keywords.some((k) => text.toLowerCase().includes(k))) {
    await raiseHandoff(config, contactRow, `they said "${text.slice(0, 120)}"`, text);
    return { status: "handoff", reason: "matched a hand-over keyword" };
  }

  const history = await recentMessages(params.contactId);
  const [owner] = contactRow.assignedUserId
    ? await db.select({ name: user.name }).from(user).where(eq(user.id, contactRow.assignedUserId)).limit(1)
    : [];
  const icpName = await icpLabel(contactRow.interest);

  let result: ReplyDecision | null;
  try {
    const generated = await generateText({
      model: modelFor(config.provider, config.model),
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      // Gemini 3 spends the output budget thinking before it writes, which
      // truncates the JSON mid-sentence. There is nothing to reason about
      // here — the rules and the facts are both in the prompt.
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      system: systemPrompt({
        businessInfo: config.businessInfo,
        instructions: [config.instructions, params.extraInstructions].filter(Boolean).join("\n"),
        contactName: contactRow.name,
        city: contactRow.city,
        icp: icpName ?? contactRow.interest,
        leadStatus: contactRow.leadStatus,
        ownerName: owner?.name ?? null,
      }) + OUTPUT_RULES,
      prompt: [
        "The conversation so far (oldest first):",
        history.length ? history : "(no earlier messages)",
        "",
        `Their latest message: ${text}`,
        "",
        "Write the reply.",
      ].join("\n"),
    });
    result = parseDecision(generated.text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ai-reply] model call failed:", message);
    await raiseHandoff(config, contactRow, `the assistant could not answer (${message})`, text);
    return {
      status: "handoff",
      reason: err instanceof MissingApiKeyError ? message : "the model could not be reached",
    };
  }

  if (!result) {
    // Unreadable answer. A person deals with it; we do not send a guess.
    await raiseHandoff(config, contactRow, "the assistant's answer could not be read", text);
    return { status: "handoff", reason: "could not read the model's answer" };
  }
  const reply = result.reply.slice(0, 900);

  const sent = await sendTextMessage({ contactId: params.contactId, body: reply, aiGenerated: true });
  if (sent.status === "failed") {
    // Usually the 24h window closing between their message and this reply.
    await raiseHandoff(config, contactRow, `WhatsApp refused the reply (${sent.error ?? "no reason"})`, text);
    return { status: "handoff", reason: sent.error ?? "WhatsApp refused the message" };
  }

  await emitDomainEvent(
    db,
    DomainEventType.AI_REPLY_SENT,
    {
      contactId: params.contactId,
      incoming: text,
      reply,
      intent: result.intent,
      handoff: result.handoff,
      unhandledReason: params.unhandledReason,
    },
    { contactId: params.contactId, idempotencyKey: `ai_reply:${sent.messageId}` },
  );

  if (result.handoff) {
    await raiseHandoff(config, contactRow, result.handoffReason || "the assistant was not sure", text);
  }

  return { status: "sent", messageId: sent.messageId, handoff: result.handoff, text: reply };
}

/** Puts it in front of a person: a task for the owner, and an event. */
async function raiseHandoff(
  config: typeof aiReplyConfig.$inferSelect,
  contactRow: typeof contact.$inferSelect,
  reason: string,
  incoming: string,
): Promise<void> {
  if (config.handoffCreatesTask) {
    await db.insert(task).values({
      contactId: contactRow.id,
      clinicId: contactRow.clinicId,
      type: "whatsapp_reply",
      title: `Reply on WhatsApp: ${contactRow.name ?? contactRow.phone ?? "lead"}`,
      notes: `They said: "${incoming.slice(0, 500)}"\n\nWhy it needs a person: ${reason}`,
      assignedUserId: contactRow.assignedUserId,
      assignedRole: contactRow.assignedRole,
      dueAt: new Date(),
    });
  }
  await emitDomainEvent(
    db,
    DomainEventType.AI_HANDOFF_REQUESTED,
    { contactId: contactRow.id, reason, incoming },
    { contactId: contactRow.id },
  );
}

/** The thread so far, as plain lines the model can read. */
async function recentMessages(contactId: string): Promise<string> {
  const [conversation] = await db
    .select({ id: communicationConversation.id })
    .from(communicationConversation)
    .where(
      and(eq(communicationConversation.contactId, contactId), eq(communicationConversation.channel, "whatsapp")),
    )
    .limit(1);
  if (!conversation) return "";

  const rows = await db
    .select({
      direction: communicationMessage.direction,
      body: communicationMessage.body,
      createdAt: communicationMessage.createdAt,
    })
    .from(communicationMessage)
    .where(eq(communicationMessage.conversationId, conversation.id))
    .orderBy(desc(communicationMessage.createdAt))
    .limit(MAX_HISTORY);

  return rows
    .reverse()
    .filter((m) => m.body)
    .map((m) => `${m.direction === "inbound" ? "Them" : "Us"}: ${m.body}`)
    .join("\n");
}

/** The ICP's readable name, so the model says "knee pain", not "knee_pain". */
async function icpLabel(code: string | null): Promise<string | null> {
  if (!code) return null;
  const [row] = await db
    .select({ name: leadRule.name })
    .from(leadRule)
    .where(and(eq(leadRule.kind, "interest"), eq(leadRule.interest, code)))
    .orderBy(asc(leadRule.priority))
    .limit(1);
  return row?.name ?? null;
}

/** Runs the model without sending anything — the "try it" box in Setup. */
/** This clinic's AI settings row, or the unscoped one while paths migrate. */
export async function aiConfigFor(clinicId: string | null | undefined) {
  if (clinicId) {
    const [row] = await db.select().from(aiReplyConfig).where(eq(aiReplyConfig.clinicId, clinicId)).limit(1);
    if (row) return row;
  }
  const [any] = await db.select().from(aiReplyConfig).limit(1);
  return any ?? null;
}

export async function previewReply(params: {
  incomingText: string;
  contactName?: string | null;
  city?: string | null;
  clinicId?: string | null;
}): Promise<ReplyDecision | { error: string }> {
  const config = await aiConfigFor(params.clinicId);
  if (!config) return { error: "No settings row" };
  try {
    const { text } = await generateText({
      model: modelFor(config.provider, config.model),
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      // Gemini 3 spends the output budget thinking before it writes, which
      // truncates the JSON mid-sentence. There is nothing to reason about
      // here — the rules and the facts are both in the prompt.
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      system: systemPrompt({
        businessInfo: config.businessInfo,
        instructions: config.instructions,
        contactName: params.contactName ?? "Test lead",
        city: params.city ?? null,
        icp: null,
        leadStatus: "NEW",
        ownerName: null,
      }) + OUTPUT_RULES,
      prompt: `Their latest message: ${params.incomingText}\n\nWrite the reply.`,
    });
    const decision = parseDecision(text);
    return decision ?? { error: `The model did not answer in the expected form: ${text.slice(0, 200)}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

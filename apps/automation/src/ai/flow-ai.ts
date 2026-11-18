import { generateText } from "ai";
import { db } from "@workspace/db/client";
import { aiReplyConfig, contact } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { modelFor } from "./model";
import { parseDecision } from "./auto-reply";

/**
 * The AI step inside a flow, as opposed to the fallback replier.
 *
 * Both read the same settings (Setup -> AI replies): one model, one set of
 * clinic facts, one set of safety rules. A flow adds its own instruction for
 * the step at hand ("ask which day suits them", "is this a yes?") — it never
 * gets to override what the assistant may state or promise, because a rule
 * that can be turned off in a flow is not a rule.
 */

export class AiNotConfiguredError extends Error {}

async function settings(clinicId?: string | null) {
  const [row] = clinicId
    ? await db.select().from(aiReplyConfig).where(eq(aiReplyConfig.clinicId, clinicId)).limit(1)
    : [];
  if (row) return row;
  const [any] = await db.select().from(aiReplyConfig).limit(1);
  if (!any) throw new AiNotConfiguredError("AI is not set up — open Setup → AI replies");
  return any;
}

/** The clinic the person belongs to, so the step uses that clinic's settings. */
async function clinicOf(contactId?: string): Promise<string | null> {
  if (!contactId) return null;
  const [row] = await db.select({ clinicId: contact.clinicId }).from(contact).where(eq(contact.id, contactId)).limit(1);
  return row?.clinicId ?? null;
}

const SAFETY = [
  "You work for a Predict physiotherapy clinic in India.",
  "Never give medical advice, a diagnosis or an opinion on a condition, scan or medicine.",
  "State only facts from CLINIC INFORMATION below; never invent a price, timing, address or offer.",
  "Never promise a cure, a result, or a recovery timeline.",
  "Reply in the language the person wrote in. English in, English out; Hinglish in, Hinglish out.",
];

function basePrompt(config: typeof aiReplyConfig.$inferSelect, extra: string): string {
  return [
    ...SAFETY,
    "",
    "CLINIC INFORMATION (the only facts you may state):",
    config.businessInfo.trim() || "(nothing written yet — state no facts at all.)",
    config.instructions.trim() ? `\nHOUSE STYLE:\n${config.instructions.trim()}` : "",
    extra.trim() ? `\nTHIS STEP:\n${extra.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function contactLine(contactId: string | undefined): Promise<string> {
  if (!contactId) return "";
  const [row] = await db.select().from(contact).where(eq(contact.id, contactId)).limit(1);
  if (!row) return "";
  return [
    "\nWHO YOU ARE TALKING TO:",
    `Name: ${row.name ?? "unknown"}`,
    `City: ${row.city ?? "unknown"}`,
    `Enquiry was about: ${row.interest?.replace(/_/g, " ") ?? "unknown"}`,
  ].join("\n");
}

async function run(config: typeof aiReplyConfig.$inferSelect, system: string, prompt: string): Promise<string> {
  const { text } = await generateText({
    model: modelFor(config.provider, config.model),
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    system,
    prompt,
  });
  return text.trim();
}

/**
 * Sorts a reply into one of the flow's own branches — "is this a yes, a no,
 * or a question?" — so a flow can react to what somebody meant rather than to
 * the exact words a Wait for Reply branch was drawn for.
 *
 * Returns null when the answer fits none of them; the flow then takes its
 * "unclear" branch, which is where a person picks it up.
 */
export async function aiClassify(params: {
  contactId?: string;
  instructions: string;
  input: string;
  choices: { id: string; label: string }[];
}): Promise<{ choice: string | null; reason: string }> {
  const config = await settings(await clinicOf(params.contactId));
  const list = params.choices.map((c) => `- ${c.id}: ${c.label}`).join("\n");
  const system = [
    basePrompt(config, params.instructions),
    await contactLine(params.contactId),
    "",
    "Decide which single option below best matches the message.",
    list,
    "",
    'Answer with one JSON object and nothing else: {"reply": "<the option id, or unclear>", "handoff": false, "handoffReason": "", "intent": "<why, in a few words>"}',
  ].join("\n");

  const text = await run(config, system, `Message: ${params.input}`);
  const decision = parseDecision(text);
  const picked = decision?.reply.trim().toLowerCase();
  const match = params.choices.find((c) => c.id.toLowerCase() === picked);
  return { choice: match?.id ?? null, reason: decision?.intent ?? text.slice(0, 200) };
}

/**
 * Writes something for the flow to use — the body of the next message, a
 * summary of the conversation for a task, a one-line note for the caller.
 * Nothing is sent: the flow decides what happens with the text.
 */
export async function aiWrite(params: {
  contactId?: string;
  instructions: string;
  input?: string;
}): Promise<string> {
  const config = await settings(await clinicOf(params.contactId));
  const system = [
    basePrompt(config, params.instructions),
    await contactLine(params.contactId),
    "",
    "Write only the text asked for. No preamble, no quotes, no markdown.",
  ].join("\n");
  return run(config, system, params.input?.trim() || "Write it.");
}

import type { FlowNode, NodeExecutor, RunContext } from "./types";
import { autoReply } from "../ai/auto-reply";
import { aiClassify, aiWrite } from "../ai/flow-ai";

interface AiConfig {
  /**
   * answer   — reply to the contact on WhatsApp, in their language, from the
   *            clinic information in Setup → AI replies. Branches: answered /
   *            needs a person.
   * classify — read their last message and take one of this node's branches.
   * write    — produce text into the run's context for a later node to use.
   */
  mode?: "answer" | "classify" | "write";
  /** What this step should do. Added to the standing rules, never replacing them. */
  prompt?: string;
  /** classify: the branches this node offers. */
  choices?: { id: string; label: string }[];
  /** Where the message to work on comes from. Defaults to the last reply. */
  inputFrom?: string;
  /** write/classify: context key the result is stored under. */
  outputKey?: string;
}

function readPath(context: RunContext, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      context,
    );
}

/** The message this step is about — usually what the contact just said. */
function inputText(config: AiConfig, context: RunContext): string {
  const raw = readPath(context, config.inputFrom ?? "lastReplyBody");
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const fallback = context.lastReplyBody ?? context.lastButtonId;
  return typeof fallback === "string" ? fallback : "";
}

/**
 * The AI step in a flow. It shares one set of clinic facts and safety rules
 * with the fallback replier (Setup → AI replies) — a flow can tell it what to
 * do at this step, never what it is allowed to claim.
 */
export const aiExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = (node.data.config ?? {}) as AiConfig;
    const mode = config.mode ?? "answer";
    const contactId = typeof context.contactId === "string" ? context.contactId : undefined;
    const input = inputText(config, context);

    if (mode === "classify") {
      const choices = (config.choices ?? []).filter((c) => c?.id);
      if (!choices.length) throw new Error("AI node: add at least one option to choose between");
      if (!input) {
        return { output: { branch: "unclear", reason: "nothing to read" }, contextPatch: {} };
      }
      const { choice, reason } = await aiClassify({
        contactId,
        instructions: config.prompt ?? "",
        input,
        choices,
      });
      return {
        output: { branch: choice ?? "unclear", choice, reason },
        contextPatch: config.outputKey ? { [config.outputKey]: choice ?? "unclear" } : undefined,
      };
    }

    if (mode === "write") {
      const text = await aiWrite({ contactId, instructions: config.prompt ?? "", input });
      return {
        output: { text },
        contextPatch: { [config.outputKey || "aiText"]: text },
      };
    }

    // answer: the same path an unmatched inbound message takes, so the daily
    // cap, the "a human replied recently" pause and the hand-over task all
    // apply here too — a flow must not become a way around them.
    if (!contactId) throw new Error("AI node: no contactId in run context");
    const outcome = await autoReply({
      contactId,
      incomingText: input || "(they have not written anything yet)",
      unhandledReason: "AI step in a flow",
      extraInstructions: config.prompt,
    });

    const answered = outcome.status === "sent" && !outcome.handoff;
    return {
      output: { branch: answered ? "answered" : "handoff", ...outcome },
      contextPatch: {
        aiReply: outcome.status === "sent" ? outcome.text : null,
        aiHandoff: !answered,
      },
    };
  },
};

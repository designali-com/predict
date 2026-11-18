import type { FlowNode, NodeExecutor } from "./types";

interface WaitForReplyConfig {
  /** Optional — if the contact never replies within this window, the run
   * resumes down the "timeout" branch instead of waiting forever. */
  timeoutMs?: number;
}

// Suspends the run until the contact actually replies on WhatsApp (button
// click or free-text message) — NOT a timer. The inbound webhook
// (http-server.ts) finds this run by contactId + waitingForReply=true and
// resumes it directly, picking the outgoing edge whose sourceHandle matches
// the button id that was clicked (or "any_reply" / "timeout").
export const waitForReplyExecutor: NodeExecutor = {
  async execute(node: FlowNode) {
    const config = node.data.config as WaitForReplyConfig;
    return {
      output: { waiting: true, timeoutMs: config.timeoutMs ?? null },
      suspend: { kind: "waitForReply", timeoutMs: config.timeoutMs },
    };
  },
};

import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface WebhookConfig {
  url: string;
}

// Outbound notification to an external URL — distinct from API Call mainly
// in intent (fire-and-forget event notification vs. fetching/pushing data).
export const webhookExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as WebhookConfig;
    const response = await fetch(config.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(context),
    });
    return { output: { status: response.status } };
  },
};

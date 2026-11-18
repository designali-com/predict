import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface ApiCallConfig {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH";
  bodyFromContext?: boolean;
  outputKey?: string;
}

export const apiCallExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as ApiCallConfig;
    const response = await fetch(config.url, {
      method: config.method ?? "GET",
      headers: { "content-type": "application/json" },
      body: config.bodyFromContext ? JSON.stringify(context) : undefined,
    });
    const body = await response.json().catch(() => null);
    const output = { status: response.status, body };
    return {
      output,
      contextPatch: config.outputKey ? { [config.outputKey]: body } : undefined,
    };
  },
};

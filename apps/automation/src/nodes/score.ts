import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface ScoreConfig {
  field: string; // dot path into context to read a numeric value from
  outputKey: string;
}

function readPath(context: RunContext, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      context,
    );
}

// MVP: passes a numeric context value through under a new key so flows can
// branch on it. Real weighted-scoring rules are a business decision to be
// layered on here later — this is the extension point, not the final logic.
export const scoreExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as ScoreConfig;
    const value = readPath(context, config.field);
    const score = typeof value === "number" ? value : 0;
    return {
      output: { score },
      contextPatch: { [config.outputKey]: score },
    };
  },
};

import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface LoopConfig {
  itemsFromContext: string; // dot path to an array already in context
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

// Partial implementation: resolves the item list and makes it available in
// context, but does not yet re-run a connected sub-graph once per item —
// that needs the engine to support re-entrant node execution, which is a
// bigger addition than this first engine milestone covers. A flow using
// Loop today gets a single pass over its next node, not one pass per item.
export const loopExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as LoopConfig;
    const items = readPath(context, config.itemsFromContext);
    const list = Array.isArray(items) ? items : [];
    return {
      output: { count: list.length },
      contextPatch: { [config.outputKey]: list },
    };
  },
};

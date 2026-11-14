import type { FlowNode, NodeExecutor, RunContext } from "./types";

type Operator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "exists";

interface ConditionConfig {
  field: string; // dot path into context, e.g. "biologicalAge.delta"
  operator: Operator;
  value?: unknown;
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

function evaluate(operator: Operator, actual: unknown, expected: unknown): boolean {
  switch (operator) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
  }
}

// Branches by producing output.result: true/false. The engine picks the
// outgoing edge whose sourceHandle is "true" or "false" to match.
export const conditionExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as ConditionConfig;
    const actual = readPath(context, config.field);
    const result = evaluate(config.operator, actual, config.value);
    return { output: { result } };
  },
};

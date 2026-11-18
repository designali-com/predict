import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface VariableConfig {
  outputKey: string;
  value: unknown;
}

export const variableExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as VariableConfig;
    return {
      output: { [config.outputKey]: config.value },
      contextPatch: { [config.outputKey]: config.value },
    };
  },
};

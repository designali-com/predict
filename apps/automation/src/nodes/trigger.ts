import type { NodeExecutor } from "./types";

// The entry point of a flow. It doesn't do anything itself — the engine
// starts a run here with the triggering domain event's payload already in
// context — but it still needs a registry entry so the graph walk treats it
// like any other node.
export const triggerExecutor: NodeExecutor = {
  async execute() {
    return { output: null };
  },
};

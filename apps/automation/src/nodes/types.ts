// React Flow's own node/edge shape — this is exactly what a future visual
// builder would read/write, so the engine consumes it as-is.
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface RunContext {
  [key: string]: unknown;
}

export type SuspendReason =
  /** Time-based suspend (Delay node) — resumed by a BullMQ delayed job. */
  | { kind: "delay"; resumeAt: Date; stay?: boolean }
  /** Suspend until the contact actually replies on WhatsApp (Wait for
   * Reply node) — resumed by the inbound webhook matching this run by
   * contactId, not by time. `timeoutMs` optionally still resumes it down
   * the "timeout" branch if nothing comes back in time. */
  | { kind: "waitForReply"; timeoutMs?: number }
  /** Suspend until a specific domain event fires for this contact — e.g.
   * waiting up to 7 days for APPOINTMENT_CREATED before branching into
   * "not re-engaged". Same mechanism as waitForReply, keyed on an event
   * type instead of an inbound WhatsApp message. */
  | { kind: "waitForEvent"; eventType: string; timeoutMs?: number };

export interface NodeExecutionResult {
  output: unknown;
  /** Merged into the run's context after this node completes. */
  contextPatch?: RunContext;
  /** Set to suspend the run instead of completing immediately. */
  suspend?: SuspendReason;
}

export interface NodeExecutor {
  execute(node: FlowNode, context: RunContext): Promise<NodeExecutionResult>;
}

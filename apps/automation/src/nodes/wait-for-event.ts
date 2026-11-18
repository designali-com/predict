import type { FlowNode, NodeExecutor } from "./types";

interface WaitForEventConfig {
  eventType: string; // DomainEventType, e.g. APPOINTMENT_CREATED
  timeoutMs?: number;
}

// Suspends until a specific domain event fires for THIS contact — e.g. "did
// this lead book an appointment within 7 days?". Resumed by the worker's
// domain-event poll matching a waiting run by contactId + eventType, not by
// a WhatsApp reply (see wait-for-reply.ts for that variant) and not purely
// by time (though an optional timeout still branches on "timeout").
export const waitForEventExecutor: NodeExecutor = {
  async execute(node: FlowNode) {
    const config = node.data.config as WaitForEventConfig;
    if (!config.eventType) {
      throw new Error("Wait for Event node: eventType is required");
    }
    return {
      output: { waitingFor: config.eventType, timeoutMs: config.timeoutMs ?? null },
      suspend: { kind: "waitForEvent", eventType: config.eventType, timeoutMs: config.timeoutMs },
    };
  },
};

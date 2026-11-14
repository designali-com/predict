import { db } from "@workspace/db/client";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import type { DomainEventType } from "@workspace/db/domain-events";
import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface EmitEventConfig {
  eventType?: string;
}

// The generic hand-off node — "this flow is done with this contact for now,
// something else should pick up from here." Emits a plain domain event and
// stops; whatever other flow is subscribed to that event type starts a
// completely independent run. This is what keeps flows decoupled: the
// Nurture flow's "Schedule an appointment" branch doesn't call the
// Appointment Booking flow directly, it just emits APPOINTMENT_REQUESTED —
// so the exact same button could just as well be wired from a reminder
// flow, a website button, or a staff action, without touching this node.
export const emitEventExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as EmitEventConfig;
    if (!config.eventType) throw new Error("Emit Event node: no eventType configured");

    const contactId = typeof context.contactId === "string" ? context.contactId : undefined;
    await emitDomainEvent(db, config.eventType as DomainEventType, { ...context }, { contactId });

    return { output: { emitted: config.eventType } };
  },
};

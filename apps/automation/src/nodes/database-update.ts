import { db } from "@workspace/db/client";
import { contact, adherenceLog } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { isContactStage } from "@workspace/db/contact-stage";
import type { FlowNode, NodeExecutor, RunContext } from "./types";

// Deliberately not "run arbitrary SQL from flow config" — a flow author
// picks one of these named operations, never a raw table/column target.
// Clinical/biomarker tables are intentionally not reachable from here at
// all (see "Core algorithm isolation" in the plan).
const OPERATIONS = {
  // Moves the contact along the lifecycle. Separate from engagement on
  // purpose: writing a nurture outcome used to overwrite the stage, so a
  // nurtured lead stopped matching `stage == "LEAD"` in every other flow.
  async setContactStage(contactId: string, stage: string) {
    if (!isContactStage(stage)) {
      throw new Error(`Database Update node: "${stage}" is not a valid contact stage`);
    }
    await db.update(contact).set({ stage, updatedAt: new Date() }).where(eq(contact.id, contactId));

    // Lets a separate flow react to this exact transition without having to
    // live inside the same flow.
    await emitDomainEvent(db, DomainEventType.CONTACT_STAGE_CHANGED, { contactId, stage }, { contactId });
  },

  // Records where the contact sits in nurture, leaving their stage alone.
  async setContactEngagement(contactId: string, engagement: string) {
    await db
      .update(contact)
      .set({ engagement, updatedAt: new Date() })
      .where(eq(contact.id, contactId));

    await emitDomainEvent(
      db,
      DomainEventType.CONTACT_ENGAGEMENT_CHANGED,
      { contactId, engagement },
      { contactId },
    );
  },

  async logAdherenceEntry(contactId: string, logType: string, status: string) {
    await db.insert(adherenceLog).values({ contactId, logType, status, source: "whatsapp" });
  },
} as const;

type DatabaseUpdateConfig =
  | { operation: "setContactStage"; contactIdFromContext?: string; stage: string }
  | { operation: "setContactEngagement"; contactIdFromContext?: string; engagement: string }
  | {
      operation: "logAdherenceEntry";
      contactIdFromContext?: string;
      logType: string; // medication | exercise | diet
      status: string; // done | partial | missed
    };

function readPath(context: RunContext, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      context,
    );
}

export const databaseUpdateExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as DatabaseUpdateConfig;
    const contactId = readPath(context, config.contactIdFromContext ?? "contactId");
    if (typeof contactId !== "string") {
      throw new Error(
        `Database Update node: no contact id found at "${config.contactIdFromContext ?? "contactId"}"`,
      );
    }

    if (config.operation === "setContactStage") {
      await OPERATIONS.setContactStage(contactId, config.stage);
    } else if (config.operation === "setContactEngagement") {
      await OPERATIONS.setContactEngagement(contactId, config.engagement);
    } else if (config.operation === "logAdherenceEntry") {
      await OPERATIONS.logAdherenceEntry(contactId, config.logType, config.status);
    } else {
      throw new Error(`Database Update node: unknown operation`);
    }

    return { output: { operation: config.operation, contactId } };
  },
};

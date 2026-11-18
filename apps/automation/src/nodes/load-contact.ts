import { db } from "@workspace/db/client";
import { contact } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface LoadContactConfig {
  contactIdFromContext?: string;
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

// The run's context only ever has what was in the triggering event's
// payload, or what a later node explicitly wrote into it — it does NOT
// automatically stay in sync with the contact's live status. A flow that
// needs to check "has this lead already converted?" days after it started
// (e.g. before sending the Day 3 / Day 5 follow-up) must re-fetch first —
// that's what this node is for. Puts the fresh row under context.contact,
// so a Condition node right after can check e.g. "contact.stage".
export const loadContactExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as LoadContactConfig;
    const contactId = readPath(context, config.contactIdFromContext ?? "contactId");
    if (typeof contactId !== "string") {
      throw new Error("Load Contact node: no contact id found in context");
    }

    const [row] = await db.select().from(contact).where(eq(contact.id, contactId)).limit(1);
    if (!row) throw new Error(`Load Contact node: contact ${contactId} not found`);

    return {
      output: { stage: row.stage, engagement: row.engagement },
      contextPatch: { contact: row },
    };
  },
};

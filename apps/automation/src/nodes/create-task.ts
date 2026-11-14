import { db } from "@workspace/db/client";
import { task } from "@workspace/db/schema";
import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface CreateTaskConfig {
  title: string;
  type?: string;
  assignedRole?: string; // doctor | health_coach | admin
  dueInMs?: number; // relative to when this node runs
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

// The human-in-the-loop step — "Day 5: Health Coach Direct Call", "Day 21:
// Doctor review". Automation can't make the call itself, so it hands off a
// task for a staff member to pick up (see the Tasks page in the dashboard).
export const createTaskExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as CreateTaskConfig;
    const contactId = readPath(context, config.contactIdFromContext ?? "contactId");
    if (typeof contactId !== "string") {
      throw new Error('Create Task node: no contact id found (expected "contactId" in context)');
    }
    if (!config.title) {
      throw new Error("Create Task node: title is required");
    }

    const [row] = await db
      .insert(task)
      .values({
        contactId,
        type: config.type ?? "follow_up",
        title: config.title,
        assignedRole: config.assignedRole ?? null,
        // No createdByUserId: a flow has no person behind it. The run id is
        // the honest answer to "why does this task exist?", and the task page
        // links back to it.
        createdByRunId: typeof context.runId === "string" ? context.runId : null,
        dueAt: config.dueInMs ? new Date(Date.now() + config.dueInMs) : null,
      })
      .returning();

    return { output: { taskId: row?.id } };
  },
};

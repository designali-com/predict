import { db } from "@workspace/db/client";
import { appointment } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { planVisitWait, type VisitWaitMode } from "../lib/visit-schedule";
import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface WaitUntilVisitConfig {
  mode: VisitWaitMode;
}

const UPCOMING = new Set(["scheduled", "confirmed"]);

// Parks the run until a clock time derived from the visit, then takes the
// "due" branch. "skip" is for a visit that is too soon, already over, or
// cancelled — the next wait still runs, so a short gap drops the messages
// that no longer fit instead of sending them all at once.
//
// The run stays ON this node while it waits. When the timer fires the node
// runs again and re-reads the visit, so a reschedule moves the later
// messages instead of delivering "tomorrow" on the old day.
export const waitUntilVisitExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const mode = (node.data.config as WaitUntilVisitConfig).mode;
    const appointmentId = context.appointmentId;
    if (!mode || typeof appointmentId !== "string") {
      return { output: { branch: "skip", reason: "visit wait is not configured" } };
    }

    const [row] = await db
      .select({ scheduledAt: appointment.scheduledAt, status: appointment.status })
      .from(appointment)
      .where(eq(appointment.id, appointmentId))
      .limit(1);

    if (!row || !UPCOMING.has(row.status)) {
      return { output: { branch: "skip", reason: row ? "visit is not upcoming" : "visit was not found" } };
    }

    const flowStartedAt =
      typeof context.flowStartedAt === "string" ? new Date(context.flowStartedAt) : new Date();
    const plan = planVisitWait({
      mode,
      now: new Date(),
      scheduledAt: row.scheduledAt,
      flowStartedAt,
    });

    if (plan.action === "wait") {
      return {
        output: { branch: "due", resumeAt: plan.at.toISOString() },
        suspend: { kind: "delay", resumeAt: plan.at, stay: true },
      };
    }

    if (plan.action === "skip") return { output: { branch: "skip", reason: plan.reason } };
    return { output: { branch: "due" } };
  },
};

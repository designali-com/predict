import { db } from "@workspace/db/client";
import { appointment } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import type { FlowNode, NodeExecutor, RunContext } from "./types";

// Reads the booked visit onto the run so the doctor check and the later
// "day before / morning of" waits use the row, not whatever the event
// happened to include. Some booking paths only put appointmentId in the
// payload.
export const loadVisitExecutor: NodeExecutor = {
  async execute(_node: FlowNode, context: RunContext) {
    const patch: RunContext = {};
    if (typeof context.flowStartedAt !== "string") patch.flowStartedAt = new Date().toISOString();

    const appointmentId = context.appointmentId;
    if (typeof appointmentId !== "string") {
      return { output: { loaded: false }, contextPatch: patch };
    }

    const [row] = await db
      .select({ doctorUserId: appointment.doctorUserId, status: appointment.status })
      .from(appointment)
      .where(eq(appointment.id, appointmentId))
      .limit(1);

    if (row?.doctorUserId) patch.doctorUserId = row.doctorUserId;
    if (row) patch.appointmentStatus = row.status;
    return { output: { loaded: !!row }, contextPatch: patch };
  },
};

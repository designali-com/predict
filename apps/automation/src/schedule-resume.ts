import { db } from "@workspace/db/client";
import { automationFlowRun } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { flowQueue } from "./queue";

/**
 * If a run just suspended on a Delay node, schedules the BullMQ delayed job
 * that resumes it. If it suspended on a Wait for Reply node *with* a
 * timeout, schedules the "timeout" branch instead — a plain "resume" job
 * would bypass branch resolution entirely. A Wait for Reply node with no
 * timeout has no resumeAt and is intentionally left un-scheduled; only the
 * inbound webhook resumes it. Shared by the worker's normal event-driven
 * path and the dashboard's "Test" button.
 */
export async function scheduleResumeIfWaiting(runId: string): Promise<void> {
  const [run] = await db
    .select()
    .from(automationFlowRun)
    .where(eq(automationFlowRun.id, runId))
    .limit(1);
  if (!run || run.status !== "waiting" || !run.resumeAt) return;

  const delay = Math.max(0, run.resumeAt.getTime() - Date.now());

  if (run.waitingForReply || run.waitingForEventType) {
    await flowQueue.add(
      "reply",
      { kind: "reply", runId, branchKey: "timeout" },
      { delay, jobId: `timeout-${runId}-${run.resumeAt.getTime()}` },
    );
    return;
  }

  await flowQueue.add(
    "resume",
    { kind: "resume", runId },
    { delay, jobId: `resume-${runId}-${run.resumeAt.getTime()}` },
  );
}

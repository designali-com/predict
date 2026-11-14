import { db } from "@workspace/db/client";
import { automationFlowRun, automationTriggerExecution, lifecycleEvent } from "@workspace/db/schema";
import { and, eq, isNull, lte, sql } from "@workspace/db";
import { advanceRun, startRun } from "./engine";
import { scheduleResumeIfWaiting } from "./schedule-resume";

// A queue job normally picks a pending start up within a second. Anything
// still pending after this was claimed and then lost — Redis refused the
// job, or the job died before it created a run. The poll will not try
// again on its own, because the claim row already exists.
const STUCK_AFTER_MS = 45_000;
const BATCH = 20;

/** Take a pending claim so a queue job and this rescue cannot both start it. */
export async function claimPendingStart(executionId: string): Promise<boolean> {
  const [row] = await db
    .update(automationTriggerExecution)
    .set({ status: "running" })
    .where(
      and(
        eq(automationTriggerExecution.id, executionId),
        eq(automationTriggerExecution.status, "pending"),
        isNull(automationTriggerExecution.runId),
      ),
    )
    .returning({ id: automationTriggerExecution.id });
  return !!row;
}

async function releaseClaim(executionId: string): Promise<void> {
  await db
    .update(automationTriggerExecution)
    .set({ status: "pending" })
    .where(
      and(
        eq(automationTriggerExecution.id, executionId),
        eq(automationTriggerExecution.status, "running"),
        isNull(automationTriggerExecution.runId),
      ),
    );
}

/**
 * Start flow runs whose trigger was claimed but never produced a run.
 *
 * Goes straight to the run, not back through the queue: the queue is the
 * thing that just failed, and the first nurture message should not wait
 * on it. A later Delay still schedules through the queue, and the
 * reconciliation sweep retries that if the schedule itself fails.
 */
export async function rescuePendingStarts(minAgeMs = STUCK_AFTER_MS): Promise<number> {
  const cutoff = new Date(Date.now() - minAgeMs);
  const stuck = await db
    .select({
      id: automationTriggerExecution.id,
      flowId: automationTriggerExecution.flowId,
      lifecycleEventId: automationTriggerExecution.lifecycleEventId,
      contactId: lifecycleEvent.contactId,
      payload: lifecycleEvent.payload,
    })
    .from(automationTriggerExecution)
    .innerJoin(lifecycleEvent, eq(lifecycleEvent.id, automationTriggerExecution.lifecycleEventId))
    .where(
      and(
        eq(automationTriggerExecution.status, "pending"),
        isNull(automationTriggerExecution.runId),
        lte(automationTriggerExecution.createdAt, cutoff),
      ),
    )
    .limit(BATCH);

  let started = 0;
  for (const row of stuck) {
    if (!(await claimPendingStart(row.id))) continue;

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(row.payload);
    } catch {
      // leave payload empty if it wasn't valid JSON
    }

    try {
      const runId = await startRun({
        flowId: row.flowId,
        lifecycleEventId: row.lifecycleEventId,
        contactId: row.contactId ?? undefined,
        initialContext: { ...payload, contactId: row.contactId ?? undefined },
      });
      await db
        .update(automationTriggerExecution)
        .set({ status: "completed", runId, completedAt: new Date() })
        .where(eq(automationTriggerExecution.id, row.id));
      // The queue may be the reason this start was stuck. Don't let a
      // hung Redis call hold the rest of the batch; the reconciliation
      // sweep schedules the Delay again once resumeAt has passed.
      await Promise.race([
        scheduleResumeIfWaiting(runId),
        new Promise((_, reject) => setTimeout(() => reject(new Error("resume schedule timed out")), 3_000)),
      ]).catch((err) => {
        console.error(`[automation] resume schedule failed for run ${runId}:`, err);
      });
      started += 1;
    } catch (err) {
      console.error(`[automation] pending start ${row.id} failed:`, err);
      await releaseClaim(row.id);
    }
  }
  return started;
}

// How long a Delay may sit past its resume time before we stop waiting
// for the queue and continue the run ourselves.
const STRANDED_AFTER_MS = 3 * 60_000;

/**
 * A Delay whose resume time has passed and whose queue job never arrived.
 * Wait-for-reply and wait-for-event stays are left alone — those wake from
 * the person's reply or from the event, and a late timer is a different branch.
 */
export async function resumeStrandedDelays(): Promise<number> {
  const cutoff = new Date(Date.now() - STRANDED_AFTER_MS);
  const rows = await db
    .select({ id: automationFlowRun.id })
    .from(automationFlowRun)
    .where(
      and(
        eq(automationFlowRun.status, "waiting"),
        lte(automationFlowRun.resumeAt, cutoff),
        eq(automationFlowRun.waitingForReply, false),
        isNull(automationFlowRun.waitingForEventType),
      ),
    )
    .limit(BATCH);

  let resumed = 0;
  for (const row of rows) {
    try {
      await advanceRun(row.id);
      resumed += 1;
    } catch (err) {
      console.error(`[automation] stranded delay ${row.id} failed:`, err);
    }
  }
  return resumed;
}

/** A run "running" this long with no step started is dead, not busy. */
const STALLED_AFTER_MINUTES = 30;

/**
 * Runs left "running" with nothing happening — a worker that died mid-run, or
 * the duplicate-wake bug that once had two workers driving one run. Nothing
 * resumes a running run (advanceRun leaves it to its owner), so without this
 * they sit forever.
 *
 * They are ended, not resumed: picking one up now would send whatever message
 * was next, at whatever time it happens to be, to somebody who may already
 * have had too many.
 */
export async function endStalledRuns(): Promise<number> {
  const ended = await db.execute(sql`
    update automation_flow_run r
    set status = 'failed', completed_at = now(), resume_at = null
    where r.status = 'running'
      and r.started_at < now() - make_interval(mins => ${STALLED_AFTER_MINUTES})
      and not exists (
        select 1 from automation_node_execution e
        where e.run_id = r.id
          and e.started_at > now() - make_interval(mins => ${STALLED_AFTER_MINUTES})
      )
    returning r.id
  `);
  const n = ended.rows.length;
  if (n) console.log(`[automation] ended ${n} stalled run(s)`);
  return n;
}

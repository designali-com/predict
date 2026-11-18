import "dotenv/config";
import { Worker } from "bullmq";
import { db } from "@workspace/db/client";
import { lifecycleEvent, automationTriggerExecution, automationFlowRun, contact } from "@workspace/db/schema";
import { eq, and, lte, desc, isNull } from "@workspace/db";
import { redisConnection } from "./redis";
import { flowQueue, type FlowJob } from "./queue";
import {
  startRun,
  advanceRun,
  resumeWithReply,
  findActiveFlowsForEvent,
  findWaitingRunForEvent,
} from "./engine";
import { scheduleResumeIfWaiting } from "./schedule-resume";
import { recordHeartbeat } from "@workspace/db/automation-settings";
import { callbackSweep, firstResponseSweep } from "./sweeps";
import { catchUpMetaLeads } from "./meta-lead-catchup";
import { queueStageMessages, rescueQueuedStageMessages, runStageMessage } from "./stage-messages";
import { claimPendingStart, endStalledRuns, rescuePendingStarts, resumeStrandedDelays } from "./rescue-starts";
import { runDueCampaigns } from "./campaign-send";
import { sendDailyCheckins } from "./checkins";

const EVENT_POLL_INTERVAL_MS = 5_000;
const RECONCILIATION_INTERVAL_MS = 60_000;
// Callbacks, first-response escalations and new-lead notices. A minute is
// fine for all three: none of them is about sub-minute accuracy, and it
// keeps the database load boring.
const HOUSEKEEPING_INTERVAL_MS = 60_000;
// A few forms each pass. A full rotation is a couple of minutes, which is
// soon enough for a lead ad and light enough not to hammer Graph.
const META_CATCHUP_INTERVAL_MS = 120_000;

async function processJob(data: FlowJob): Promise<void> {
  if (data.kind === "stage-message") {
    await runStageMessage(data.sendId);
    return;
  }

  if (data.kind === "start") {
    // The rescue path claims the same row. Whoever loses finds it no
    // longer pending and leaves the run that already started alone.
    if (data.triggerExecutionId && !(await claimPendingStart(data.triggerExecutionId))) return;

    try {
      const runId = await startRun({
        flowId: data.flowId,
        lifecycleEventId: data.lifecycleEventId,
        contactId: data.contactId,
        initialContext: data.initialContext,
      });

      if (data.triggerExecutionId) {
        await db
          .update(automationTriggerExecution)
          .set({ status: "completed", runId, completedAt: new Date() })
          .where(eq(automationTriggerExecution.id, data.triggerExecutionId));
      }

      await scheduleResumeIfWaiting(runId);
    } catch (err) {
      if (data.triggerExecutionId) {
        await db
          .update(automationTriggerExecution)
          .set({ status: "pending" })
          .where(
            and(
              eq(automationTriggerExecution.id, data.triggerExecutionId),
              eq(automationTriggerExecution.status, "running"),
              isNull(automationTriggerExecution.runId),
            ),
          );
      }
      throw err;
    }
    return;
  }

  if (data.kind === "reply") {
    await resumeWithReply(data.runId, data.branchKey, data.replyContext);
    await scheduleResumeIfWaiting(data.runId);
    return;
  }

  await advanceRun(data.runId);
  await scheduleResumeIfWaiting(data.runId);
}

/**
 * Finds domain events not yet picked up by each active flow subscribed to
 * that event type, and enqueues a "start" job for each — this is what turns
 * a row apps/web inserted into domain_event into an actual flow run.
 * Polling is an MVP choice; LISTEN/NOTIFY would lower latency later.
 */
/** The clinic a contact belongs to, cached for the length of one poll tick. */
const clinicCache = new Map<string, string | null>();
async function clinicOfContact(contactId: string): Promise<string | null> {
  if (clinicCache.has(contactId)) return clinicCache.get(contactId)!;
  const [row] = await db
    .select({ clinicId: contact.clinicId })
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);
  const clinicId = row?.clinicId ?? null;
  clinicCache.set(contactId, clinicId);
  return clinicId;
}

async function pollDomainEvents(): Promise<void> {
  // A contact can move between clinics (rarely, by hand); a tick-long cache
  // keeps the poll cheap without pinning a stale answer for long.
  clinicCache.clear();
  // MVP: rescans the most recent events every tick and relies on the
  // (lifecycleEventId, flowId) unique index to skip already-claimed pairs.
  // Fine at this scale; a real watermark/cursor (or LISTEN/NOTIFY) would
  // replace this before event volume gets large.
  const recentEvents = await db
    .select()
    .from(lifecycleEvent)
    .orderBy(desc(lifecycleEvent.occurredAt))
    .limit(200);

  for (const event of recentEvents) {
    // A Wait for Event node parked for this exact contact + event type
    // takes priority over starting a brand-new flow — this is what makes
    // "wait up to 7 days for APPOINTMENT_CREATED" actually resume the
    // instant the appointment is booked, not just on timeout.
    if (event.contactId) {
      const waitingRun = await findWaitingRunForEvent(event.contactId, event.type);
      if (waitingRun) {
        await flowQueue.add(
          "reply",
          { kind: "reply", runId: waitingRun.id, branchKey: "event", replyContext: { lastEventId: event.id } },
          { jobId: `event-${waitingRun.id}-${event.id}` },
        );
      }
    }

    // The fixed message for this moment, if one is switched on. Independent
    // of flows: a moment can have both, and the page warns when it does.
    await queueStageMessages(event).catch((err) => console.error("[stage-messages] queue failed:", err));

    // Which clinic did this happen in? The contact carries it; an event
    // with no contact (a system-wide one) only starts clinic-less flows.
    const clinicId = event.contactId ? await clinicOfContact(event.contactId) : null;
    const flows = await findActiveFlowsForEvent(event.type, clinicId);
    for (const flow of flows) {
      // Only what happened after this flow was switched on. Without this,
      // activating a flow starts a run for every recent event still in the
      // poll window — hundreds of old leads and patients messaged at once.
      const listeningSince = flow.activatedAt ?? flow.updatedAt;
      if (event.occurredAt < listeningSince) continue;

      const [existing] = await db
        .select()
        .from(automationTriggerExecution)
        .where(
          and(
            eq(automationTriggerExecution.lifecycleEventId, event.id),
            eq(automationTriggerExecution.flowId, flow.id),
          ),
        )
        .limit(1);
      if (existing) continue;

      let triggerExecutionId: string;
      try {
        const [row] = await db
          .insert(automationTriggerExecution)
          .values({ lifecycleEventId: event.id, flowId: flow.id, status: "pending" })
          .returning();
        triggerExecutionId = row!.id;
      } catch {
        // Unique (lifecycleEventId, flowId) violation — another poll tick
        // already claimed this pairing. Safe to skip.
        continue;
      }

      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(event.payload);
      } catch {
        // leave payload empty if it wasn't valid JSON
      }

      // A failed add must not abort the rest of the tick. The claim row
      // stays pending, and rescuePendingStarts runs the flow without the
      // queue once the job has had a moment to show up.
      try {
        await flowQueue.add(
          "start",
          {
            kind: "start",
            flowId: flow.id,
            lifecycleEventId: event.id,
            contactId: event.contactId ?? undefined,
            triggerExecutionId,
            initialContext: { ...payload, contactId: event.contactId ?? undefined },
          },
          { jobId: `start-${triggerExecutionId}` },
        );
      } catch (err) {
        console.error(`[automation] could not queue start ${triggerExecutionId}:`, err);
      }
    }
  }
}

/**
 * Safety net, not the primary resume path — a Delay node's resume job is
 * scheduled directly in BullMQ when it suspends. This only catches a run
 * whose job was somehow lost (e.g. a Redis incident).
 *
 * Only ever acts on runs with a concrete resumeAt in the past — a Wait for
 * Reply node with no configured timeout has resumeAt = null and must stay
 * parked indefinitely until the contact actually replies, not get swept.
 */
async function reconciliationSweep(): Promise<void> {
  const overdue = await db
    .select()
    .from(automationFlowRun)
    .where(and(eq(automationFlowRun.status, "waiting"), lte(automationFlowRun.resumeAt, new Date())))
    .limit(200);

  for (const run of overdue) {
    // A new id every minute piles a job per run for as long as the queue is
    // stuck. One id per due time: a second sweep finds it already queued.
    const jobId = `sweep-${run.id}-${run.resumeAt?.getTime() ?? "due"}`;
    try {
      if (run.waitingForReply || run.waitingForEventType) {
        // Timed out waiting for a reply/event — resume down the "timeout" branch.
        await flowQueue.add(
          "reply",
          { kind: "reply", runId: run.id, branchKey: "timeout" },
          { jobId },
        );
      } else {
        await flowQueue.add(
          "resume",
          { kind: "resume", runId: run.id },
          { jobId },
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/already exists/i.test(message)) {
        console.error(`[automation] could not queue sweep for run ${run.id}:`, err);
      }
    }
  }
}

const worker = new Worker<FlowJob>(
  "automation-flow",
  async (job) => {
    await processJob(job.data);
  },
  { connection: redisConnection },
);

worker.on("failed", (job, err) => {
  console.error(`[automation] job ${job?.id} failed:`, err);
});

console.log("[automation] worker started");

setInterval(() => {
  pollDomainEvents().catch((err) => console.error("[automation] poll failed:", err));
}, EVENT_POLL_INTERVAL_MS);

setInterval(() => {
  reconciliationSweep().catch((err) => console.error("[automation] sweep failed:", err));
}, RECONCILIATION_INTERVAL_MS);

// Pending claims the queue never turned into a run. Direct, so a dead
// queue does not leave a new lead with an empty chat.
function rescueStuckRuns(): Promise<unknown> {
  return Promise.all([
    rescuePendingStarts().catch((err) => console.error("[automation] pending-start rescue failed:", err)),
    resumeStrandedDelays().catch((err) => console.error("[automation] stranded-delay rescue failed:", err)),
    rescueQueuedStageMessages().catch((err) => console.error("[automation] stage-message rescue failed:", err)),
    endStalledRuns().catch((err) => console.error("[automation] stalled-run cleanup failed:", err)),
  ]);
}

void rescueStuckRuns();
setInterval(() => {
  void rescueStuckRuns();
}, RECONCILIATION_INTERVAL_MS);

/**
 * The checks nobody does by hand, plus the "I am alive" stamp the console
 * reads. Each is caught separately: one failing must not stop the other.
 *
 * Neither sends email any more — what they find shows on the call queue.
 */
async function housekeeping(): Promise<void> {
  for (const [name, run] of [
    ["callbacks", callbackSweep],
    ["first response", firstResponseSweep],
  ] as const) {
    try {
      const acted = await run();
      if (acted > 0) console.log(`[automation] ${name}: acted on ${acted}`);
    } catch (err) {
      console.error(`[automation] ${name} sweep failed:`, err);
    }
  }
  await recordHeartbeat(db, "worker").catch(() => {});
}

void housekeeping();
setInterval(() => {
  housekeeping().catch((err) => console.error("[automation] housekeeping failed:", err));
}, HOUSEKEEPING_INTERVAL_MS);

setInterval(() => {
  catchUpMetaLeads().catch((err) => console.error("[automation] meta lead catch-up failed:", err));
}, META_CATCHUP_INTERVAL_MS);

// Scheduled campaigns go out from here, not from a browser tab. The tick is
// cheap when nothing is due, and runDueCampaigns refuses to overlap itself, so
// a send that takes an hour simply holds the slot until it is done.
const CAMPAIGN_INTERVAL_MS = 20_000;
setInterval(() => {
  runDueCampaigns().catch((err) => console.error("[automation] campaign tick failed:", err));
}, CAMPAIGN_INTERVAL_MS);

// The daily check-ins on WhatsApp (medicine, exercise, diet). Nothing goes before 9 am IST,
// nothing of a kind until its template is approved, and at most once per patient,
// kind and day; a two-minute tick keeps the send close to its set time.
const CHECKIN_INTERVAL_MS = 2 * 60_000;
setInterval(() => {
  sendDailyCheckins().catch((err) => console.error("[automation] daily check-ins failed:", err));
}, CHECKIN_INTERVAL_MS);

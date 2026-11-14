import { db } from "@workspace/db/client";
import {
  automationFlow,
  automationFlowVersion,
  automationFlowRun,
  automationNodeExecution,
} from "@workspace/db/schema";
import { and, eq } from "@workspace/db";
import { MESSAGING_NODES, isNurtureFlow, nurtureStopReason } from "./lead-nurture-guard";
import { nodeRegistry } from "./nodes/index";
import type { FlowGraph, FlowNode, RunContext } from "./nodes/index";

function findStartNode(graph: FlowGraph): FlowNode {
  const trigger = graph.nodes.find((n) => n.type === "trigger");
  if (!trigger) throw new Error("Flow graph has no trigger node");
  return trigger;
}

// Nodes that offer more than one exit path signal which one via their
// output, keyed by node type — same idea as Condition's true/false, applied
// to "did this send find anything to offer" and "did the booking succeed".
function computeBranch(nodeType: string, output: unknown): string | undefined {
  const out = output as Record<string, unknown>;
  switch (nodeType) {
    case "condition":
      return out.result ? "true" : "false";
    case "sendAvailableDates":
    case "sendAvailableTimeSlots":
      return out.available ? "available" : "empty";
    case "bookAppointment":
      return out.booked ? "booked" : "full";
    case "ai":
    case "waitUntilVisit":
      return typeof out.branch === "string" ? out.branch : undefined;
    default:
      return undefined;
  }
}

function findNextNodeId(graph: FlowGraph, fromNodeId: string, branch?: string): string | null {
  const outgoing = graph.edges.filter((e) => e.source === fromNodeId);
  if (outgoing.length === 0) return null;

  if (branch) {
    const matched = outgoing.find((e) => e.sourceHandle === branch);
    return matched?.target ?? null;
  }

  return outgoing[0]?.target ?? null;
}

export async function startRun(params: {
  flowId: string;
  lifecycleEventId?: string;
  contactId?: string;
  initialContext: RunContext;
}): Promise<string> {
  const [version] = await db
    .select()
    .from(automationFlowVersion)
    .where(
      and(
        eq(automationFlowVersion.flowId, params.flowId),
        eq(automationFlowVersion.isActive, true),
      ),
    )
    .limit(1);

  if (!version) {
    throw new Error(`Flow ${params.flowId} has no active version`);
  }

  // A start that was claimed twice (the queue job and the pending rescue)
  // must not send the first message twice. The run already owns the rest.
  if (params.lifecycleEventId) {
    const [already] = await db
      .select({ id: automationFlowRun.id })
      .from(automationFlowRun)
      .where(
        and(
          eq(automationFlowRun.flowId, params.flowId),
          eq(automationFlowRun.lifecycleEventId, params.lifecycleEventId),
        ),
      )
      .limit(1);
    if (already) return already.id;
  }

  const graph = { nodes: version.nodes, edges: version.edges } as FlowGraph;
  const startNode = findStartNode(graph);

  const [run] = await db
    .insert(automationFlowRun)
    .values({
      flowId: params.flowId,
      flowVersionId: version.id,
      lifecycleEventId: params.lifecycleEventId,
      contactId: params.contactId,
      status: "running",
      currentNodeId: startNode.id,
      context: params.initialContext,
    })
    .returning();

  if (!run) throw new Error("Failed to create automation flow run");

  await advanceRun(run.id, { owned: true });
  return run.id;
}

/** A wake-up this far ahead of a Delay's time is early, not clock skew. */
const EARLY_WAKE_TOLERANCE_MS = 30_000;

/**
 * Executes nodes starting at the run's currentNodeId until the run
 * completes, fails, or suspends (Delay / Wait for Reply node). Safe to call
 * again on a "waiting" run — it resumes exactly where it left off.
 *
 * Every wake-up — the delayed job, the sweep, the stranded-run rescue, a
 * duplicate of any of them — comes through here, so this is where a run is
 * protected from being driven twice or too soon:
 *
 *   - a run that is already "running" belongs to whoever set it running;
 *     a second caller leaves it alone. Only the two callers that set it
 *     running themselves (startRun, resumeWithReply) pass `owned`.
 *   - a Delay is not resumed before its time. A job left over from an
 *     earlier wait of the same run would otherwise wake the next wait early,
 *     and a seven-day sequence goes out in an afternoon.
 */
export async function advanceRun(runId: string, opts: { owned?: boolean } = {}): Promise<void> {
  const [run] = await db
    .select()
    .from(automationFlowRun)
    .where(eq(automationFlowRun.id, runId))
    .limit(1);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status === "completed" || run.status === "failed") return;
  if (run.status === "running" && !opts.owned) return;

  if (
    run.status === "waiting" &&
    !run.waitingForReply &&
    !run.waitingForEventType &&
    run.resumeAt &&
    run.resumeAt.getTime() > Date.now() + EARLY_WAKE_TOLERANCE_MS
  ) {
    return;
  }

  // A Delay can be woken by its queue job and by the stranded-run rescue
  // at the same moment. Only the update that still sees "waiting" proceeds,
  // so the next WhatsApp goes out once.
  if (run.status === "waiting") {
    const [claimed] = await db
      .update(automationFlowRun)
      .set({ status: "running", waitingForReply: false, waitingForEventType: null, resumeAt: null })
      .where(and(eq(automationFlowRun.id, runId), eq(automationFlowRun.status, "waiting")))
      .returning({ id: automationFlowRun.id });
    if (!claimed) return;
  }

  const [version] = await db
    .select()
    .from(automationFlowVersion)
    .where(eq(automationFlowVersion.id, run.flowVersionId))
    .limit(1);
  if (!version) throw new Error(`Flow version ${run.flowVersionId} not found`);

  const graph = { nodes: version.nodes, edges: version.edges } as FlowGraph;
  let currentNodeId: string | null = run.currentNodeId;
  // Stamped on every node's context so a Send node can tag its outbound
  // message with the run that sent it (see communicationMessage.runId) —
  // without this, messages are only traceable back to a contact, and
  // re-running the same flow for the same contact makes every run's
  // history bleed together.
  let context = { ...(run.context as RunContext), runId };

  await db
    .update(automationFlowRun)
    .set({ status: "running", waitingForReply: false, waitingForEventType: null })
    .where(eq(automationFlowRun.id, runId));

  while (currentNodeId) {
    const node = graph.nodes.find((n) => n.id === currentNodeId);
    if (!node) {
      await failRun(runId, `Node ${currentNodeId} not found in graph`);
      return;
    }

    const executor = nodeRegistry[node.type];
    if (!executor) {
      await failRun(runId, `No executor registered for node type "${node.type}"`);
      return;
    }

    // A lead nurture stops writing the moment the lead is no longer one to
    // chase — reached, replied, booked, not interested. See lead-nurture-guard.
    if (MESSAGING_NODES.has(node.type) && (await isNurtureFlow(run.flowId))) {
      const stop = await nurtureStopReason(run.contactId, run.startedAt);
      if (stop) {
        console.log(`[automation] run ${runId} stopped before ${node.id}: ${stop}`);
        break;
      }
    }

    const [execRow] = await db
      .insert(automationNodeExecution)
      .values({
        runId,
        nodeId: node.id,
        type: node.type,
        input: context,
        status: "running",
      })
      .returning();

    try {
      const result = await executor.execute(node, context);
      context = { ...context, ...(result.contextPatch ?? {}) };

      await db
        .update(automationNodeExecution)
        .set({ status: "completed", output: result.output, completedAt: new Date() })
        .where(eq(automationNodeExecution.id, execRow!.id));

      if (result.suspend?.kind === "delay") {
        // stay: the node itself runs again when the timer fires (a visit
        // reminder re-reads the appointment). Otherwise the run continues
        // at the next node, which is how a plain Wait has always worked.
        const stay = result.suspend.stay === true;
        const branch = stay ? undefined : computeBranch(node.type, result.output);
        const nextNodeId = stay ? node.id : findNextNodeId(graph, node.id, branch);
        await db
          .update(automationFlowRun)
          .set({
            status: "waiting",
            currentNodeId: nextNodeId,
            context,
            resumeAt: result.suspend.resumeAt,
            waitingForReply: false,
          })
          .where(eq(automationFlowRun.id, runId));
        return;
      }

      if (result.suspend?.kind === "waitForReply") {
        // Stays parked ON this node (not advanced) — resumeWithReply()
        // computes the next node from here once we know which branch the
        // reply matched.
        const resumeAt = result.suspend.timeoutMs
          ? new Date(Date.now() + result.suspend.timeoutMs)
          : null;
        await db
          .update(automationFlowRun)
          .set({
            status: "waiting",
            currentNodeId: node.id,
            context,
            resumeAt,
            waitingForReply: true,
          })
          .where(eq(automationFlowRun.id, runId));
        return;
      }

      if (result.suspend?.kind === "waitForEvent") {
        const resumeAt = result.suspend.timeoutMs
          ? new Date(Date.now() + result.suspend.timeoutMs)
          : null;
        await db
          .update(automationFlowRun)
          .set({
            status: "waiting",
            currentNodeId: node.id,
            context,
            resumeAt,
            waitingForEventType: result.suspend.eventType,
          })
          .where(eq(automationFlowRun.id, runId));
        return;
      }

      const branch = computeBranch(node.type, result.output);
      currentNodeId = findNextNodeId(graph, node.id, branch);

      await db
        .update(automationFlowRun)
        .set({ currentNodeId, context })
        .where(eq(automationFlowRun.id, runId));
    } catch (err) {
      await db
        .update(automationNodeExecution)
        .set({
          status: "failed",
          output: { error: err instanceof Error ? err.message : String(err) },
          completedAt: new Date(),
        })
        .where(eq(automationNodeExecution.id, execRow!.id));
      await failRun(runId, err instanceof Error ? err.message : String(err));
      return;
    }
  }

  await db
    .update(automationFlowRun)
    .set({
      status: "completed",
      completedAt: new Date(),
      resumeAt: null,
      waitingForReply: false,
      waitingForEventType: null,
    })
    .where(eq(automationFlowRun.id, runId));
}

/**
 * Resumes a run parked on either a Wait for Reply node (inbound WhatsApp
 * webhook calls this with the clicked button's id, or "any_reply"/"timeout")
 * or a Wait for Event node (worker's domain-event poll calls this with
 * "event"/"timeout"). Picks whichever outgoing edge from the wait node
 * matches branchKey; if none matches, the run just completes there.
 */
export async function resumeWithReply(
  runId: string,
  branchKey: string,
  replyContext: RunContext = {},
): Promise<void> {
  const [run] = await db
    .select()
    .from(automationFlowRun)
    .where(eq(automationFlowRun.id, runId))
    .limit(1);
  if (!run || run.status !== "waiting") return;
  if (!run.waitingForReply && !run.waitingForEventType) return;

  const [version] = await db
    .select()
    .from(automationFlowVersion)
    .where(eq(automationFlowVersion.id, run.flowVersionId))
    .limit(1);
  if (!version) throw new Error(`Flow version ${run.flowVersionId} not found`);

  const graph = { nodes: version.nodes, edges: version.edges } as FlowGraph;

  // A dynamic Wait for Reply (date/time-slot pickers, where the button ids
  // are computed at send-time and can't be pre-wired as fixed edges) names a
  // context key via captureReplyAs — the raw selected value (branchKey, e.g.
  // "2026-08-15" or "13:00-14:00") lands there so the next node can read it,
  // and resolution always falls through the single "any_reply" edge since
  // there's no way to pre-draw a branch per possible date/slot.
  const currentNode = graph.nodes.find((n) => n.id === run.currentNodeId);
  const captureReplyAs =
    currentNode?.type === "waitForReply"
      ? (currentNode.data?.config as { captureReplyAs?: string } | undefined)?.captureReplyAs
      : undefined;

  const context = {
    ...(run.context as RunContext),
    ...replyContext,
    ...(captureReplyAs ? { [captureReplyAs]: branchKey } : {}),
    // What the person actually tapped ("Mon, 5 Oct", "10:00 AM – 10:30 AM"),
    // for a confirmation that reads like a sentence instead of "2026-10-05".
    ...(captureReplyAs && replyContext?.lastReplyBody ? { [`${captureReplyAs}Label`]: replyContext.lastReplyBody } : {}),
  };
  const nextNodeId =
    findNextNodeId(graph, run.currentNodeId!, branchKey) ??
    findNextNodeId(graph, run.currentNodeId!, "any_reply");

  // Two replies (or a reply and its timeout) can arrive together; only the
  // one that still finds the run waiting moves it on.
  const [claimed] = await db
    .update(automationFlowRun)
    .set({
      status: "running",
      waitingForReply: false,
      waitingForEventType: null,
      resumeAt: null,
      currentNodeId: nextNodeId,
      context,
    })
    .where(and(eq(automationFlowRun.id, runId), eq(automationFlowRun.status, "waiting")))
    .returning({ id: automationFlowRun.id });
  if (!claimed) return;

  await advanceRun(runId, { owned: true });
}

async function failRun(runId: string, reason: string): Promise<void> {
  console.error(`[automation] run ${runId} failed: ${reason}`);
  await db
    .update(automationFlowRun)
    .set({ status: "failed", completedAt: new Date() })
    .where(eq(automationFlowRun.id, runId));
}

/**
 * The active flows that should react to this event.
 *
 * Scoped to the clinic the event happened in: Delhi's nurture flow must not
 * run for a Kolkata lead. A flow with no clinic (older rows, or one meant for
 * the whole group) reacts everywhere — that is the only way to opt out.
 */
export async function findActiveFlowsForEvent(eventType: string, clinicId?: string | null) {
  const flows = await db
    .select()
    .from(automationFlow)
    .where(and(eq(automationFlow.triggerEventType, eventType), eq(automationFlow.status, "active")));

  if (!clinicId) return flows.filter((f) => !f.clinicId);
  return flows.filter((f) => !f.clinicId || f.clinicId === clinicId);
}

/**
 * The button-click flows that will actually do something with this button.
 *
 * A flow on COMMUNICATION_BUTTON_CLICKED usually opens with a Check on
 * buttonId ("Book my slot") and ends there for any other button. Counting it
 * as an answer to every tap is how a "YES" on a nurture message got neither a
 * flow nor the AI's reply. A flow that opens with anything else is taken at
 * its word.
 */
export async function flowsHandlingButton(buttonId: string, clinicId?: string | null) {
  const flows = await findActiveFlowsForEvent("COMMUNICATION_BUTTON_CLICKED", clinicId);
  const handling = [];
  for (const flow of flows) {
    const [version] = await db
      .select({ nodes: automationFlowVersion.nodes, edges: automationFlowVersion.edges })
      .from(automationFlowVersion)
      .where(and(eq(automationFlowVersion.flowId, flow.id), eq(automationFlowVersion.isActive, true)))
      .limit(1);
    if (!version) continue;
    const graph = { nodes: version.nodes, edges: version.edges } as FlowGraph;
    const trigger = graph.nodes.find((n) => n.type === "trigger");
    const first = trigger ? graph.nodes.find((n) => n.id === findNextNodeId(graph, trigger.id)) : undefined;
    const check = first?.type === "condition" ? (first.data.config as { field?: string; operator?: string; value?: unknown }) : null;
    if (check?.field === "buttonId" && check.operator === "eq") {
      if (String(check.value ?? "").trim().toLowerCase() !== buttonId.trim().toLowerCase()) continue;
    }
    handling.push(flow);
  }
  return handling;
}

/**
 * Does this waiting run actually have somewhere to go for this reply?
 *
 * A run parked on Wait for Reply with branches for "Yes" and "No" has no
 * answer for "kitna kharcha aayega?" — resumeWithReply would walk it off the
 * end of the graph and complete the run silently. The webhook asks this
 * first, and hands anything unmatched to the AI replier instead.
 */
export async function replyHasBranch(runId: string, branchKey: string): Promise<boolean> {
  const [run] = await db.select().from(automationFlowRun).where(eq(automationFlowRun.id, runId)).limit(1);
  if (!run?.currentNodeId) return false;
  const [version] = await db
    .select()
    .from(automationFlowVersion)
    .where(eq(automationFlowVersion.id, run.flowVersionId))
    .limit(1);
  if (!version) return false;

  const graph = { nodes: version.nodes, edges: version.edges } as FlowGraph;
  const node = graph.nodes.find((n) => n.id === run.currentNodeId);
  // A dynamic picker (dates, slots) captures whatever comes back, so every
  // reply is "expected" by definition.
  if ((node?.data?.config as { captureReplyAs?: string } | undefined)?.captureReplyAs) return true;
  return (
    findNextNodeId(graph, run.currentNodeId, branchKey) !== null ||
    findNextNodeId(graph, run.currentNodeId, "any_reply") !== null
  );
}

export async function findWaitingRunForContact(contactId: string) {
  const [run] = await db
    .select()
    .from(automationFlowRun)
    .where(
      and(
        eq(automationFlowRun.contactId, contactId),
        eq(automationFlowRun.status, "waiting"),
        eq(automationFlowRun.waitingForReply, true),
      ),
    )
    .limit(1);
  return run ?? null;
}

export async function findWaitingRunForEvent(contactId: string, eventType: string) {
  const [run] = await db
    .select()
    .from(automationFlowRun)
    .where(
      and(
        eq(automationFlowRun.contactId, contactId),
        eq(automationFlowRun.status, "waiting"),
        eq(automationFlowRun.waitingForEventType, eventType),
      ),
    )
    .limit(1);
  return run ?? null;
}

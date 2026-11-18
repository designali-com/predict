import { NextResponse } from "next/server";
import { leadRegion } from "@workspace/db/lead-region";
import { db } from "@workspace/db/client";
import {
  contact,
  lifecycleEvent,
  automationFlowRun,
  automationFlow,
  automationFlowVersion,
} from "@workspace/db/schema";
import { eq, desc } from "@workspace/db";
import { requireOperations } from "@/src/lib/auth/guards";
import type { FlowNode } from "@/src/nodes";

/**
 * Why this person got the messages they got: the domain events recorded
 * against them, and every automation run those events started.
 *
 * An agent whose first line is "I see we messaged you on Tuesday" needs the
 * run that sent it and the node it is parked on — a flow silently waiting on
 * a reply that never came is the single most common reason a lead looks
 * abandoned.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [contactRow] = await db.select().from(contact).where(eq(contact.id, id)).limit(1);
  if (!contactRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const events = await db
    .select()
    .from(lifecycleEvent)
    .where(eq(lifecycleEvent.contactId, id))
    .orderBy(desc(lifecycleEvent.occurredAt))
    .limit(100);

  const runRows = await db
    .select({
      id: automationFlowRun.id,
      status: automationFlowRun.status,
      startedAt: automationFlowRun.startedAt,
      completedAt: automationFlowRun.completedAt,
      currentNodeId: automationFlowRun.currentNodeId,
      resumeAt: automationFlowRun.resumeAt,
      waitingForReply: automationFlowRun.waitingForReply,
      waitingForEventType: automationFlowRun.waitingForEventType,
      flowName: automationFlow.name,
      flowTrigger: automationFlow.triggerEventType,
      nodes: automationFlowVersion.nodes,
    })
    .from(automationFlowRun)
    .innerJoin(automationFlow, eq(automationFlowRun.flowId, automationFlow.id))
    .innerJoin(automationFlowVersion, eq(automationFlowRun.flowVersionId, automationFlowVersion.id))
    .where(eq(automationFlowRun.contactId, id))
    .orderBy(desc(automationFlowRun.startedAt))
    .limit(50);

  // Resolve the parked node to its label from the version the run is actually
  // executing — not the flow's current draft, which may have been re-edited
  // since. Node ids alone tell an agent nothing.
  // A Kolkata lead gets no lead nurture (see lead-nurture-guard): say so on
  // the run, since the engine only logs why it stopped.
  const kolkata = leadRegion(contactRow) === "KOLKATA";
  const runs = runRows.map(({ nodes, flowTrigger, ...run }) => {
    const node = (nodes as FlowNode[] | null)?.find((n) => n.id === run.currentNodeId);
    const data = node?.data as { label?: string; nodeKind?: string } | undefined;
    return {
      ...run,
      currentNodeLabel: data?.label ?? null,
      currentNodeKind: data?.nodeKind ?? node?.type ?? null,
      blockedReason:
        kolkata && (flowTrigger === "LEAD_STATUS_NEW" || flowTrigger === "LEAD_CAPTURED")
          ? "Kolkata lead — no nurture messages are sent"
          : null,
    };
  });

  return NextResponse.json({ events, runs });
}

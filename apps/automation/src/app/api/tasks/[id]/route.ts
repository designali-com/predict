import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { task, contact, user, automationFlow, automationFlowRun } from "@workspace/db/schema";
import { aliasedTable, eq } from "@workspace/db";
import { requireOperations } from "@/src/lib/auth/guards";

const STATUSES = ["open", "done", "cancelled"];

// Two joins onto `user` — without separate aliases the assignee's name would
// overwrite the creator's.
const assignee = aliasedTable(user, "assignee");
const creator = aliasedTable(user, "creator");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [row] = await db
    .select({
      id: task.id,
      title: task.title,
      notes: task.notes,
      type: task.type,
      status: task.status,
      dueAt: task.dueAt,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      assignedRole: task.assignedRole,
      assignedUserId: task.assignedUserId,
      assignedUserName: assignee.name,
      createdByUserId: task.createdByUserId,
      createdByName: creator.name,
      createdByRunId: task.createdByRunId,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      contactStage: contact.stage,
      contactEngagement: contact.engagement,
    })
    .from(task)
    .innerJoin(contact, eq(task.contactId, contact.id))
    .leftJoin(assignee, eq(task.assignedUserId, assignee.id))
    .leftJoin(creator, eq(task.createdByUserId, creator.id))
    .where(eq(task.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The flow that raised it, when one did — "why does this task exist?" is the
  // first thing anyone asks about a task nobody remembers creating.
  let raisedBy: { flowName: string; runStatus: string } | null = null;
  if (row.createdByRunId) {
    const [run] = await db
      .select({ flowName: automationFlow.name, runStatus: automationFlowRun.status })
      .from(automationFlowRun)
      .innerJoin(automationFlow, eq(automationFlowRun.flowId, automationFlow.id))
      .where(eq(automationFlowRun.id, row.createdByRunId))
      .limit(1);
    raisedBy = run ?? null;
  }

  return NextResponse.json({ task: row, raisedBy });
}

/**
 * Claim, close, and edit. Claiming writes assignedUserId — a pull queue, not
 * an allocation: you take the task you are about to work, which is what stops
 * two people ringing the same person.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const updates: Partial<typeof task.$inferInsert> = {};

  if (body?.status !== undefined) {
    const status = typeof body.status === "string" ? body.status : "";
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: "status must be open, done, or cancelled" }, { status: 400 });
    }
    updates.status = status;
    updates.completedAt = status === "done" ? new Date() : null;
  }

  // claim: true takes it for whoever is signed in; false releases it back to
  // the shared queue. Deliberately not "assign this to someone else" — that
  // would be a different action with a different question behind it.
  if (body?.claim !== undefined) {
    updates.assignedUserId = body.claim ? session.user.id : null;
  }

  if (typeof body?.notes === "string") updates.notes = body.notes || null;
  if (body?.dueAt !== undefined) {
    updates.dueAt = typeof body.dueAt === "string" && body.dueAt ? new Date(body.dueAt) : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [row] = await db.update(task).set(updates).where(eq(task.id, id)).returning();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task: row });
}

import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { automationFlow, automationFlowVersion } from "@workspace/db/schema";
import { eq, and, desc } from "@workspace/db";
import { requirePermission } from "@/src/lib/auth/guards";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.flows");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [flow] = await db.select().from(automationFlow).where(eq(automationFlow.id, id)).limit(1);
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [activeVersion] = await db
    .select()
    .from(automationFlowVersion)
    .where(and(eq(automationFlowVersion.flowId, id), eq(automationFlowVersion.isActive, true)))
    .limit(1);

  return NextResponse.json({ flow, version: activeVersion ?? null });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.flows");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const [flow] = await db.select().from(automationFlow).where(eq(automationFlow.id, id)).limit(1);
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Name/status updates apply directly.
  if (body?.name || body?.status) {
    await db
      .update(automationFlow)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.status ? { status: body.status } : {}),
        // Switching it on starts the clock: from now, not from history.
        ...(body.status === "active" && flow.status !== "active" ? { activatedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(automationFlow.id, id));
  }

  // A graph edit publishes a new version rather than mutating the active
  // one — in-flight runs stay pinned to whichever version they started on.
  if (Array.isArray(body?.nodes) && Array.isArray(body?.edges)) {
    const [latest] = await db
      .select()
      .from(automationFlowVersion)
      .where(eq(automationFlowVersion.flowId, id))
      .orderBy(desc(automationFlowVersion.versionNumber))
      .limit(1);

    await db
      .update(automationFlowVersion)
      .set({ isActive: false })
      .where(eq(automationFlowVersion.flowId, id));

    await db.insert(automationFlowVersion).values({
      flowId: id,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      nodes: body.nodes,
      edges: body.edges,
      isActive: true,
      publishedAt: new Date(),
    });

    if (typeof body?.triggerEventType === "string") {
      await db
        .update(automationFlow)
        .set({ triggerEventType: body.triggerEventType, updatedAt: new Date() })
        .where(eq(automationFlow.id, id));
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.flows");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // Cascades to automationFlowVersion / automationFlowRun / automationTriggerExecution
  // (all reference flowId with onDelete: "cascade") — deleting a flow that
  // already ran for real contacts also deletes its run history, which is
  // why the UI requires typing DELETE to confirm.
  await db.delete(automationFlow).where(eq(automationFlow.id, id));

  return NextResponse.json({ success: true });
}

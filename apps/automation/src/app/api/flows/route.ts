import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { automationFlow, automationFlowVersion } from "@workspace/db/schema";
import { eq, and, desc } from "@workspace/db";
import { requireClinicPermission } from "@/src/lib/auth/clinic";

export async function GET() {
  const context = await requireClinicPermission("ops.flows");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A flow belongs to the clinic it was built in. One with no clinic is a
  // leftover from before clinics existed and is shown everywhere until an
  // admin claims it.
  const all = await db.select().from(automationFlow).orderBy(desc(automationFlow.createdAt));
  const flows = all.filter((f) => !f.clinicId || f.clinicId === context.clinic.id);

  const withVersions = await Promise.all(
    flows.map(async (flow) => {
      const [activeVersion] = await db
        .select()
        .from(automationFlowVersion)
        .where(
          and(
            eq(automationFlowVersion.flowId, flow.id),
            eq(automationFlowVersion.isActive, true),
          ),
        )
        .limit(1);
      return {
        ...flow,
        stepCount: activeVersion ? (activeVersion.nodes as unknown[]).length : 0,
      };
    }),
  );

  return NextResponse.json({ flows: withVersions });
}

export async function POST(req: Request) {
  const context = await requireClinicPermission("ops.flows");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const triggerEventType = typeof body?.triggerEventType === "string" ? body.triggerEventType : "";
  const nodes = Array.isArray(body?.nodes) ? body.nodes : [];
  const edges = Array.isArray(body?.edges) ? body.edges : [];

  if (!name || !triggerEventType) {
    return NextResponse.json({ error: "name and triggerEventType are required" }, { status: 400 });
  }

  const [flow] = await db
    .insert(automationFlow)
    .values({ name, triggerEventType, status: "draft", clinicId: context.clinic.id })
    .returning();

  await db.insert(automationFlowVersion).values({
    flowId: flow!.id,
    versionNumber: 1,
    nodes,
    edges,
    isActive: true,
    publishedAt: new Date(),
  });

  return NextResponse.json({ id: flow!.id }, { status: 201 });
}

import "dotenv/config";
import { db } from "@workspace/db/client";
import { automationFlow, automationFlowVersion, communicationTemplate } from "@workspace/db/schema";
import { and, desc, eq, inArray } from "@workspace/db";
import type { FlowGraph } from "./nodes/index";

/**
 * The 14-message OPTM lead nurture, published as a new version of the flow
 * that already fires on LEAD_STATUS_NEW ("7 day nurture new lead").
 *
 *   lead comes in → 30 min (the telecaller calls first) → day 1 … day 14
 *
 * Each step is a Nurture Message (nodes/nurture-step.ts): the next message
 * goes the next day if this one was read, after a day's rest if not, and a
 * message Meta refused is sent once more before moving on. Mornings (10:00)
 * and evenings (17:00) alternate. About 14 days for a lead who reads, ~18 for
 * one who does not. A reply, a booking or a lead-status change ends it.
 *
 * Runs already on the old version finish on it; new leads get this one.
 * Usage: pnpm tsx src/seed-nurture-14.ts            (dry run — prints the graph)
 *        pnpm tsx src/seed-nurture-14.ts --publish  (makes it the live version)
 */

const FLOW_NAME = "7 day nurture new lead";
const NEW_NAME = "14 day nurture new lead";
const MORNING = [{ hour: 10, minute: 0 }];
const EVENING = [{ hour: 17, minute: 0 }];
const KEYS = Array.from({ length: 14 }, (_, i) => `optm_nurture_day_${String(i + 1).padStart(2, "0")}`);

function graph(): FlowGraph {
  const nodes: FlowGraph["nodes"] = [
    { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { nodeKind: "trigger", triggerEventType: "LEAD_STATUS_NEW", config: {} } },
    {
      id: "wait-telecaller",
      type: "delay",
      position: { x: 0, y: 120 },
      data: { nodeKind: "delay", label: "Wait 30 min — let the telecaller call first", config: { durationMs: 30 * 60_000 } },
    },
  ];
  KEYS.forEach((templateKey, i) => {
    nodes.push({
      id: `day-${i + 1}`,
      type: "nurtureStep",
      position: { x: 0, y: 240 + i * 120 },
      // Day 1 goes whenever the lead came in; from then on evenings and mornings alternate.
      data: { nodeKind: "nurtureStep", label: `Day ${i + 1}`, config: { templateKey, nextSlot: i % 2 === 0 ? EVENING : MORNING } },
    });
  });
  const edges = nodes.slice(1).map((n, i) => ({ id: `e-${nodes[i]!.id}-${n.id}`, source: nodes[i]!.id, target: n.id }));
  return { nodes, edges };
}

async function main() {
  const publish = process.argv.includes("--publish");
  const g = graph();

  // Every template must be approved before a lead can be sent it.
  const templates = await db
    .select({ key: communicationTemplate.key, status: communicationTemplate.submissionStatus })
    .from(communicationTemplate)
    .where(inArray(communicationTemplate.key, KEYS));
  const notReady = KEYS.filter((k) => templates.find((t) => t.key === k)?.status !== "approved");

  const [flow] = await db.select().from(automationFlow).where(eq(automationFlow.name, FLOW_NAME)).limit(1);
  if (!flow) throw new Error(`No flow named "${FLOW_NAME}"`);

  console.log(g.nodes.map((n) => `${n.id}: ${JSON.stringify(n.data.config)}`).join("\n"));
  if (notReady.length) console.log("NOT APPROVED YET:", notReady.join(", "));
  if (!publish) return void console.log("\nDry run. Add --publish to make it live.");
  if (notReady.length) throw new Error("Refusing to publish: every template must be approved first");

  const [latest] = await db
    .select({ n: automationFlowVersion.versionNumber })
    .from(automationFlowVersion)
    .where(eq(automationFlowVersion.flowId, flow.id))
    .orderBy(desc(automationFlowVersion.versionNumber))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx
      .update(automationFlowVersion)
      .set({ isActive: false })
      .where(and(eq(automationFlowVersion.flowId, flow.id), eq(automationFlowVersion.isActive, true)));
    await tx.insert(automationFlowVersion).values({
      flowId: flow.id,
      versionNumber: (latest?.n ?? 0) + 1,
      nodes: g.nodes,
      edges: g.edges,
      isActive: true,
      publishedAt: new Date(),
    });
    await tx.update(automationFlow).set({ name: NEW_NAME, updatedAt: new Date() }).where(eq(automationFlow.id, flow.id));
  });
  console.log(`\nPublished version ${(latest?.n ?? 0) + 1} of "${NEW_NAME}".`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

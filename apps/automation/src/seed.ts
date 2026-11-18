import "dotenv/config";
import { db } from "@workspace/db/client";
import { automationFlow, automationFlowVersion } from "@workspace/db/schema";
import { DomainEventType } from "@workspace/db/domain-events";
import type { FlowGraph } from "./nodes/index";

// Demo flow: WHEN a patient registers -> WAIT 10s -> SEND a welcome message.
// Exercises trigger -> delay -> sendCommunication end to end, matching the
// PATIENT_REGISTERED event apps/web now emits on registration.
async function seed() {
  const [flow] = await db
    .insert(automationFlow)
    .values({
      name: "Welcome new patient",
      triggerEventType: DomainEventType.PATIENT_REGISTERED,
      status: "active",
    })
    .returning();
  if (!flow) throw new Error("Failed to create flow");

  const graph: FlowGraph = {
    nodes: [
      { id: "trigger-1", type: "trigger", position: { x: 0, y: 0 }, data: {} },
      {
        id: "delay-1",
        type: "delay",
        position: { x: 200, y: 0 },
        data: { config: { durationMs: 10_000 } },
      },
      {
        id: "send-1",
        type: "sendCommunication",
        position: { x: 400, y: 0 },
        data: { config: { templateKey: "welcome_new_patient", channel: "whatsapp" } },
      },
    ],
    edges: [
      { id: "e1", source: "trigger-1", target: "delay-1" },
      { id: "e2", source: "delay-1", target: "send-1" },
    ],
  };

  await db.insert(automationFlowVersion).values({
    flowId: flow.id,
    versionNumber: 1,
    nodes: graph.nodes,
    edges: graph.edges,
    isActive: true,
    publishedAt: new Date(),
  });

  console.log(`Seeded flow "${flow.name}" (${flow.id})`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

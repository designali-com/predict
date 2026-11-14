import "dotenv/config";
import { db } from "@workspace/db/client";
import { automationFlow, automationFlowVersion } from "@workspace/db/schema";
import { DomainEventType } from "@workspace/db/domain-events";
import type { FlowGraph } from "./nodes/index";

// Patient Issue Intake — turns "a patient said something on WhatsApp" into a
// tracked ticket instead of a message that scrolls away.
//
// Before this, an existing patient writing "my knee hurts" produced exactly
// one thing: a row in communication_message. If no flow happened to be waiting
// on a reply from them, nothing else occurred — the message sat in the inbox
// and was found, or wasn't. Leads had the nurture flow raising tasks for them;
// patients had nothing.
//
//   COMMUNICATION_REPLIED -> Load Contact -> Check stage == PATIENT
//     true  -> Create Task "Patient reported an issue" (health_coach)
//     false -> ends here; a lead's reply is already the Lead Nurture flow's
//              job, and raising a second task would duplicate it
//
// Load Contact matters: the event payload carries whatever was true when the
// event was emitted, and stage is exactly the field that changes underneath a
// run. Re-reading it means someone who converted an hour ago is treated as
// the patient they now are.
//
// One deliberate limitation: this fires on every patient reply, including
// "thanks" and "ok". A coach closing three one-word tickets a day is a much
// smaller problem than one real complaint going unseen, so the bias is toward
// over-raising. Narrowing it needs either the AI node (not wired up yet) or a
// keyword Check node in front of Create Task.

async function seed() {
  const [flow] = await db
    .insert(automationFlow)
    .values({
      name: "Patient Issue Intake",
      triggerEventType: DomainEventType.COMMUNICATION_REPLIED,
      status: "draft",
    })
    .returning();
  if (!flow) throw new Error("Failed to create flow");

  const graph: FlowGraph = {
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        position: { x: 40, y: 200 },
        data: {
          nodeKind: "trigger",
          config: {},
          triggerEventType: DomainEventType.COMMUNICATION_REPLIED,
        },
      },
      {
        id: "load-contact",
        type: "loadContact",
        position: { x: 320, y: 200 },
        data: { nodeKind: "loadContact", config: {} },
      },
      {
        id: "check-patient",
        type: "condition",
        position: { x: 600, y: 200 },
        data: {
          nodeKind: "condition",
          config: { field: "contact.stage", operator: "eq", value: "PATIENT" },
        },
      },
      {
        id: "task-issue",
        type: "createTask",
        position: { x: 900, y: 120 },
        data: {
          nodeKind: "createTask",
          config: {
            title: "Patient reported an issue on WhatsApp — read the thread and respond",
            type: "health_coach_call",
            assignedRole: "health_coach",
            // Meta's 24h customer-service window closes a day after their
            // message, and after that a free-form reply is rejected. A due
            // date past that point would be advice to miss it.
            dueInMs: 4 * 60 * 60 * 1000,
          },
        },
      },
    ],
    edges: [
      { id: "e-trigger-load", source: "trigger-1", target: "load-contact" },
      { id: "e-load-check", source: "load-contact", target: "check-patient" },
      { id: "e-check-task", source: "check-patient", target: "task-issue", sourceHandle: "true" },
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

  console.log(`Seeded flow "${flow.name}" (${flow.id}) — status: draft.`);
  console.log("Open it in the builder and activate it when you want patient replies ticketed.");
  console.log("Every patient reply raises a task, including one-word ones — see the note in this file.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

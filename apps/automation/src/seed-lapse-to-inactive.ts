import "dotenv/config";
import { db } from "@workspace/db/client";
import { automationFlow, automationFlowVersion } from "@workspace/db/schema";
import { DomainEventType } from "@workspace/db/domain-events";
import type { FlowGraph } from "./nodes/index";

// Lapse watch — the one lifecycle transition that has no event behind it.
//
// Every other move happens because something occurred: a lead is created, an
// appointment is booked, a visit is marked completed, someone no-shows. Going
// quiet is the opposite — it is the *absence* of anything happening, and
// nothing in an event-driven system fires on absence.
//
// Wait for Event is exactly the node for that. After a completed visit this
// parks on the contact waiting for their next booking, and only the timeout
// branch does anything:
//
//   APPOINTMENT_COMPLETED
//     -> Wait for Event: APPOINTMENT_CREATED (timeout LAPSE_AFTER_MS)
//          "Event happened" -> ends. They re-booked; nothing to do, and the
//                              next completed visit starts a fresh watch.
//          "Timed out"      -> Load Contact + Check still PATIENT
//                                -> set stage INACTIVE
//                                -> Create Task so a coach actually calls
//
// The Check before the write matters. The run sits parked for months, and
// plenty can change underneath it — someone marked LOST by hand, or already
// moved on. Re-reading means the timeout only demotes people who are still
// exactly where they were.
//
// Note this only ever watches people who completed a visit, which is the
// definition of INACTIVE ("was a patient, has gone quiet"). A lead who never
// converted is the nurture flow's problem and ends up LONG_TERM instead.

// Six months with no return visit. Change this and re-run the seed; it is the
// clinic's recall window, not a technical constant.
const LAPSE_AFTER_MS = 180 * 24 * 60 * 60 * 1000;

async function seed() {
  const [flow] = await db
    .insert(automationFlow)
    .values({
      name: "Lapse Watch — mark inactive after no return visit",
      triggerEventType: DomainEventType.APPOINTMENT_COMPLETED,
      status: "draft",
    })
    .returning();
  if (!flow) throw new Error("Failed to create flow");

  const graph: FlowGraph = {
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        position: { x: 40, y: 220 },
        data: {
          nodeKind: "trigger",
          config: {},
          triggerEventType: DomainEventType.APPOINTMENT_COMPLETED,
        },
      },
      {
        id: "wait-rebook",
        type: "waitForEvent",
        position: { x: 320, y: 220 },
        data: {
          nodeKind: "waitForEvent",
          config: {
            eventType: DomainEventType.APPOINTMENT_CREATED,
            timeoutMs: LAPSE_AFTER_MS,
          },
        },
      },
      {
        id: "load-contact",
        type: "loadContact",
        position: { x: 620, y: 320 },
        data: { nodeKind: "loadContact", config: {} },
      },
      {
        id: "check-still-patient",
        type: "condition",
        position: { x: 900, y: 320 },
        data: {
          nodeKind: "condition",
          config: { field: "contact.stage", operator: "eq", value: "PATIENT" },
        },
      },
      {
        id: "set-inactive",
        type: "databaseUpdate",
        position: { x: 1200, y: 260 },
        data: {
          nodeKind: "databaseUpdate",
          config: {
            operation: "setContactStage",
            stage: "INACTIVE",
            contactIdFromContext: "contactId",
          },
        },
      },
      {
        id: "task-reactivate",
        type: "createTask",
        position: { x: 1480, y: 260 },
        data: {
          nodeKind: "createTask",
          config: {
            title: "No visit in six months — call to reactivate",
            type: "health_coach_call",
            assignedRole: "health_coach",
          },
        },
      },
    ],
    edges: [
      { id: "e-trigger-wait", source: "trigger-1", target: "wait-rebook" },
      // "event" = they booked again, so the watch simply ends here.
      { id: "e-wait-timeout", source: "wait-rebook", target: "load-contact", sourceHandle: "timeout" },
      { id: "e-load-check", source: "load-contact", target: "check-still-patient" },
      {
        id: "e-check-inactive",
        source: "check-still-patient",
        target: "set-inactive",
        sourceHandle: "true",
      },
      { id: "e-inactive-task", source: "set-inactive", target: "task-reactivate" },
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
  console.log(`Lapse window: ${LAPSE_AFTER_MS / (24 * 60 * 60 * 1000)} days with no new booking.`);
  console.log("Activate it in the builder once you are happy with that window.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

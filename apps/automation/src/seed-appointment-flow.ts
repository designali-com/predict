import "dotenv/config";
import { db } from "@workspace/db/client";
import { automationFlow, automationFlowVersion } from "@workspace/db/schema";
import { DomainEventType } from "@workspace/db/domain-events";
import type { FlowGraph } from "./nodes/index";

// Appointment Booking — deliberately its own flow, not a branch bolted onto
// Lead Nurture. Triggered on APPOINTMENT_REQUESTED, which ANYTHING can emit
// (Lead Nurture's "Schedule an appointment" button, a staff action, a
// website button, a reminder flow) via an Emit Event node — this flow
// doesn't know or care who asked, only that some contactId wants to book.
//
//   Send Available Dates -> Wait (captures selectedDate) -> Send Available
//   Time Slots -> Wait (captures selectedSlot) -> Book Appointment
//     "Booked" -> confirmation text
//     "Full"   -> loops back to Send Available Time Slots for a fresh list
//                 (the slot the patient tapped filled up between being
//                 shown and being picked — race handled inside bookSlot()'s
//                 locked transaction, not here)
//
// Both Wait nodes carry a timeout, and that is not optional. A Wait for Reply
// with no timeout gets resumeAt = null, and the worker's reconciliation sweep
// only ever touches runs whose resumeAt is in the past — so a patient who
// asked to book, saw the dates and then went quiet left their run parked in
// "waiting" forever. No task, no reminder, nobody knew. That is precisely the
// warmest lead in the system: they asked. The timeout branch hands them to a
// human instead of losing them.
//
// contact.stage only ever changes inside Book Appointment, on an actual
// successful insert — picking a date or a time slot does not convert
// anyone.
//
// doctorUserId is left blank on the Send Available Dates node — open the
// flow in the builder and pick the doctor once their weekly slots are set
// up on the Availability page, then activate it.

// How long to wait for the patient to pick a date/slot before treating it as
// a drop-off. One day: long enough that someone who replies the next morning
// still lands on the normal path, short enough that the lead is still warm
// when a coach picks up the phone.
const DROPOFF_TIMEOUT_MS = 24 * 60 * 60 * 1000;

async function seed() {
  const [flow] = await db
    .insert(automationFlow)
    .values({
      name: "Appointment Booking",
      triggerEventType: DomainEventType.APPOINTMENT_REQUESTED,
      status: "draft",
    })
    .returning();
  if (!flow) throw new Error("Failed to create flow");

  const graph: FlowGraph = {
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        position: { x: 40, y: 260 },
        data: { nodeKind: "trigger", config: {}, triggerEventType: DomainEventType.APPOINTMENT_REQUESTED },
      },
      {
        id: "send-dates",
        type: "sendAvailableDates",
        position: { x: 360, y: 260 },
        data: {
          nodeKind: "sendAvailableDates",
          config: { doctorUserId: "", daysAhead: 14, maxDates: 5 },
        },
      },
      {
        id: "task-no-dates",
        type: "createTask",
        position: { x: 360, y: 460 },
        data: {
          nodeKind: "createTask",
          config: { title: "No appointment availability found — call patient to book manually", assignedRole: "admin" },
        },
      },
      {
        id: "wait-date",
        type: "waitForReply",
        position: { x: 680, y: 260 },
        data: {
          nodeKind: "waitForReply",
          config: { expectedReplies: [], captureReplyAs: "selectedDate", timeoutMs: DROPOFF_TIMEOUT_MS },
        },
      },
      {
        id: "send-slots",
        type: "sendAvailableTimeSlots",
        position: { x: 1000, y: 260 },
        data: { nodeKind: "sendAvailableTimeSlots", config: {} },
      },
      {
        id: "task-no-slots",
        type: "createTask",
        position: { x: 1000, y: 460 },
        data: {
          nodeKind: "createTask",
          config: { title: "No time slots left on selected date — call patient to book manually", assignedRole: "admin" },
        },
      },
      {
        id: "wait-slot",
        type: "waitForReply",
        position: { x: 1320, y: 260 },
        data: {
          nodeKind: "waitForReply",
          config: { expectedReplies: [], captureReplyAs: "selectedSlot", timeoutMs: DROPOFF_TIMEOUT_MS },
        },
      },
      {
        id: "book",
        type: "bookAppointment",
        position: { x: 1640, y: 260 },
        data: { nodeKind: "bookAppointment", config: {} },
      },
      {
        id: "task-dropoff-date",
        type: "createTask",
        position: { x: 680, y: 560 },
        data: {
          nodeKind: "createTask",
          config: {
            title: "Asked to book, never picked a date — call them",
            type: "health_coach_call",
            assignedRole: "health_coach",
          },
        },
      },
      {
        id: "task-dropoff-slot",
        type: "createTask",
        position: { x: 1320, y: 560 },
        data: {
          nodeKind: "createTask",
          config: {
            title: "Picked a date, never picked a time — call them",
            type: "health_coach_call",
            assignedRole: "health_coach",
          },
        },
      },
      {
        id: "confirm",
        type: "sendText",
        position: { x: 1960, y: 180 },
        data: {
          nodeKind: "sendText",
          config: {
            bodyText: "Your appointment is confirmed for {{selectedDate}}, {{selectedSlot}}. See you then!",
          },
        },
      },
    ],
    edges: [
      { id: "e-trigger-dates", source: "trigger-1", target: "send-dates" },
      { id: "e-dates-wait", source: "send-dates", target: "wait-date", sourceHandle: "available" },
      { id: "e-dates-empty", source: "send-dates", target: "task-no-dates", sourceHandle: "empty" },
      { id: "e-waitdate-slots", source: "wait-date", target: "send-slots", sourceHandle: "any_reply" },
      { id: "e-waitdate-timeout", source: "wait-date", target: "task-dropoff-date", sourceHandle: "timeout" },
      { id: "e-slots-wait", source: "send-slots", target: "wait-slot", sourceHandle: "available" },
      { id: "e-slots-empty", source: "send-slots", target: "task-no-slots", sourceHandle: "empty" },
      { id: "e-waitslot-book", source: "wait-slot", target: "book", sourceHandle: "any_reply" },
      { id: "e-waitslot-timeout", source: "wait-slot", target: "task-dropoff-slot", sourceHandle: "timeout" },
      { id: "e-book-confirm", source: "book", target: "confirm", sourceHandle: "booked" },
      { id: "e-book-full", source: "book", target: "send-slots", sourceHandle: "full" },
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
  console.log("Set up the doctor's weekly slots on the Availability page, open this flow in the");
  console.log("builder, pick that doctor on the Send Available Dates node, then activate it.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

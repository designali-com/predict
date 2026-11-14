import "dotenv/config";
import { db } from "@workspace/db/client";
import { automationFlow, automationFlowVersion, communicationTemplate } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { DomainEventType } from "@workspace/db/domain-events";
import type { FlowGraph } from "./nodes/index";

// Day 1 / Day 3 / Day 5 lead nurture. A new lead gets up to 3 WhatsApp
// nudges over the first week, each with a "Schedule an appointment"
// quick-reply button. Tapping it hands off to the separate Appointment
// Booking flow (see seed-appointment-flow.ts) via an Emit Event node —
// this flow does NOT book anything itself and does NOT convert the
// contact; conversion only happens inside that other flow's Book
// Appointment node, on an actual successful booking. Replying with
// anything else (free text, some other button) stops the automated
// nudges too — it's a signal a human should follow up — but still
// doesn't touch contact.stage by itself.
//
// Before each follow-up, Load Contact + Check re-reads the contact's
// current status first, so a lead who converted through some other route
// while this flow was waiting also doesn't get a redundant nudge. If
// there's still no reply after the 3rd (Day 5) message's 2-day window,
// engagement flips to LONG_TERM — a separate flow triggered on
// CONTACT_ENGAGEMENT_CHANGED (engagement == LONG_TERM) takes over from there,
// kept as its own automation on purpose.
//
// TEST_DELAY_MS stands in for the real "2 days between messages" wait —
// set to 1 minute so the whole Day1->Day3->Day5->LONG_TERM sequence plays
// out in ~3 minutes instead of ~6 days. Change this back to
// 2 * 24 * 60 * 60 * 1000 (and re-run this seed) before this flow is meant
// to run for real leads.
const TEST_DELAY_MS = 60 * 1000;
const SCHEDULE_BUTTON = "Schedule an appointment";

const TEMPLATE_KEYS = { day1: "lead_day1_test", day3: "lead_day3_test", day5: "lead_day5_test" };

// Minimal draft templates so Send Message has something to resolve. These
// are NOT submitted to Meta, so a real send against them comes back failed
// ("template does not exist") — swap templateKey for a WABA-APPROVED
// template before running this flow against a real number. Each carries the
// same "Schedule an appointment" quick-reply button the Wait for Reply
// nodes below are listening for.
async function ensureTestTemplates() {
  const templates = [
    { key: TEMPLATE_KEYS.day1, name: "Lead Nurture — Day 1 (test)", body: "Hi! Thanks for your interest — want to book a consultation?" },
    { key: TEMPLATE_KEYS.day3, name: "Lead Nurture — Day 3 (test)", body: "Just checking in — still interested in booking a consultation?" },
    { key: TEMPLATE_KEYS.day5, name: "Lead Nurture — Day 5 (test)", body: "Last reminder — would you like to book a consultation?" },
  ];

  for (const t of templates) {
    const [existing] = await db.select().from(communicationTemplate).where(eq(communicationTemplate.key, t.key)).limit(1);
    if (existing) continue;
    await db.insert(communicationTemplate).values({
      key: t.key,
      name: t.name,
      channel: "whatsapp",
      category: "marketing",
      wabaCategory: "MARKETING",
      language: "en_US",
      headerType: "NONE",
      bodyText: t.body,
      ctaButtons: [{ type: "QUICK_REPLY", text: SCHEDULE_BUTTON }],
      submissionStatus: "draft",
    });
  }
}

async function seed() {
  await ensureTestTemplates();

  const [flow] = await db
    .insert(automationFlow)
    .values({
      name: "Lead Nurture (Day 1 / 3 / 5) — TEST 1min delay",
      triggerEventType: DomainEventType.LEAD_CAPTURED,
      status: "active",
    })
    .returning();
  if (!flow) throw new Error("Failed to create flow");

  const waitConfig = {
    expectedReplies: [{ id: SCHEDULE_BUTTON, label: SCHEDULE_BUTTON }],
    timeoutMs: TEST_DELAY_MS,
  };

  const graph: FlowGraph = {
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        position: { x: 40, y: 420 },
        data: { nodeKind: "trigger", config: {}, triggerEventType: DomainEventType.LEAD_CAPTURED },
      },
      {
        id: "send-day1",
        type: "sendCommunication",
        position: { x: 360, y: 420 },
        data: { nodeKind: "sendCommunication", config: { templateKey: TEMPLATE_KEYS.day1, channel: "whatsapp" } },
      },
      {
        id: "wait-day1",
        type: "waitForReply",
        position: { x: 680, y: 420 },
        data: { nodeKind: "waitForReply", config: waitConfig },
      },
      {
        id: "load-day3",
        type: "loadContact",
        position: { x: 1000, y: 240 },
        data: { nodeKind: "loadContact", config: {} },
      },
      {
        id: "check-day3",
        type: "condition",
        position: { x: 1320, y: 240 },
        data: { nodeKind: "condition", config: { field: "contact.stage", operator: "eq", value: "LEAD" } },
      },
      {
        id: "send-day3",
        type: "sendCommunication",
        position: { x: 1640, y: 240 },
        data: { nodeKind: "sendCommunication", config: { templateKey: TEMPLATE_KEYS.day3, channel: "whatsapp" } },
      },
      {
        id: "wait-day3",
        type: "waitForReply",
        position: { x: 1960, y: 240 },
        data: { nodeKind: "waitForReply", config: waitConfig },
      },
      {
        id: "load-day5",
        type: "loadContact",
        position: { x: 2280, y: 60 },
        data: { nodeKind: "loadContact", config: {} },
      },
      {
        id: "check-day5",
        type: "condition",
        position: { x: 2600, y: 60 },
        data: { nodeKind: "condition", config: { field: "contact.stage", operator: "eq", value: "LEAD" } },
      },
      {
        id: "send-day5",
        type: "sendCommunication",
        position: { x: 2920, y: 60 },
        data: { nodeKind: "sendCommunication", config: { templateKey: TEMPLATE_KEYS.day5, channel: "whatsapp" } },
      },
      {
        id: "wait-day5",
        type: "waitForReply",
        position: { x: 3240, y: 60 },
        data: { nodeKind: "waitForReply", config: waitConfig },
      },
      // Shared terminal nodes — all three Wait for Reply nodes' matching
      // branches point at the same two nodes below, since the handling is
      // identical regardless of which day's message got the reply.
      {
        id: "emit-appointment-requested",
        type: "emitEvent",
        position: { x: 1320, y: 620 },
        data: { nodeKind: "emitEvent", config: { eventType: DomainEventType.APPOINTMENT_REQUESTED } },
      },
      {
        id: "task-engaged-no-booking",
        type: "createTask",
        position: { x: 1320, y: 780 },
        data: {
          nodeKind: "createTask",
          config: {
            title: "Lead replied but didn't tap Schedule — follow up",
            assignedRole: "health_coach",
          },
        },
      },
      {
        id: "handoff-longterm",
        type: "databaseUpdate",
        position: { x: 3560, y: 240 },
        data: {
          nodeKind: "databaseUpdate",
          config: { operation: "setContactEngagement", engagement: "LONG_TERM", contactIdFromContext: "contactId" },
        },
      },
    ],
    edges: [
      { id: "e-trigger-send1", source: "trigger-1", target: "send-day1" },
      { id: "e-send1-wait1", source: "send-day1", target: "wait-day1" },
      { id: "e-wait1-schedule", source: "wait-day1", target: "emit-appointment-requested", sourceHandle: SCHEDULE_BUTTON },
      { id: "e-wait1-engaged", source: "wait-day1", target: "task-engaged-no-booking", sourceHandle: "any_reply" },
      { id: "e-wait1-load3", source: "wait-day1", target: "load-day3", sourceHandle: "timeout" },
      { id: "e-load3-check3", source: "load-day3", target: "check-day3" },
      { id: "e-check3-send3", source: "check-day3", target: "send-day3", sourceHandle: "true" },
      { id: "e-send3-wait3", source: "send-day3", target: "wait-day3" },
      { id: "e-wait3-schedule", source: "wait-day3", target: "emit-appointment-requested", sourceHandle: SCHEDULE_BUTTON },
      { id: "e-wait3-engaged", source: "wait-day3", target: "task-engaged-no-booking", sourceHandle: "any_reply" },
      { id: "e-wait3-load5", source: "wait-day3", target: "load-day5", sourceHandle: "timeout" },
      { id: "e-load5-check5", source: "load-day5", target: "check-day5" },
      { id: "e-check5-send5", source: "check-day5", target: "send-day5", sourceHandle: "true" },
      { id: "e-send5-wait5", source: "send-day5", target: "wait-day5" },
      { id: "e-wait5-schedule", source: "wait-day5", target: "emit-appointment-requested", sourceHandle: SCHEDULE_BUTTON },
      { id: "e-wait5-engaged", source: "wait-day5", target: "task-engaged-no-booking", sourceHandle: "any_reply" },
      { id: "e-wait5-longterm", source: "wait-day5", target: "handoff-longterm", sourceHandle: "timeout" },
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

  console.log(`Seeded flow "${flow.name}" (${flow.id}) — status: active.`);
  console.log(`Wait timeout between messages: ${TEST_DELAY_MS / 1000}s (test value).`);
  console.log("Uses 3 DRAFT templates (lead_day1_test/day3_test/day5_test) — they are not");
  console.log("WABA-approved, so real sends will fail. Point the Send nodes at an approved");
  console.log("template before testing this flow against a real WhatsApp number.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

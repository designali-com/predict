import "dotenv/config";
import { db } from "@workspace/db/client";
import { automationFlow, automationFlowVersion, user } from "@workspace/db/schema";
import { and, eq, ilike } from "@workspace/db";
import { DomainEventType } from "@workspace/db/domain-events";
import type { FlowGraph } from "./nodes/index";
import { assertVisitSchedule } from "./lib/visit-schedule";

// Every booked visit except Dr. Apurba Ganguly's. His own flow already sends
// the named sequence; this one uses the same timing and the unnamed templates.
//
//   confirm now
//   day after booking, 10:00 — testimonial, skipped if that day is already
//     the day before the visit
//   one day in the gap, 10:00 — protocol, skipped when the visit is soon
//   day before, 10:00
//   morning of the visit, 9:00

const FLOW_NAME = "Visit reminders";

function step(
  id: string,
  type: string,
  x: number,
  y: number,
  config: Record<string, unknown>,
  extra?: Record<string, unknown>,
) {
  return { id, type, position: { x, y }, data: { nodeKind: type, config, ...extra } };
}

function graph(gangulyUserId: string): FlowGraph {
  const send = (templateKey: string, urgent = false) => ({
    templateKey,
    requireUpcomingVisit: true,
    ...(urgent ? { ignoreQuietHours: true } : {}),
  });
  return {
    nodes: [
      step("trigger-1", "trigger", 40, 220, {}, { triggerEventType: DomainEventType.APPOINTMENT_CREATED }),
      step("load-visit", "loadVisit", 320, 220, {}),
      step("check-doctor", "condition", 600, 220, {
        field: "doctorUserId",
        operator: "neq",
        value: gangulyUserId,
        label: "Doctor is not Dr. Apurba Ganguly",
      }),
      step("send-confirm", "sendCommunication", 900, 80, send("visit_confirmed", true)),
      step("wait-testimonial", "waitUntilVisit", 1200, 80, { mode: "dayAfterBooking" }),
      step("send-testimonial", "sendCommunication", 1500, 0, send("visit_testimonial")),
      step("wait-protocol", "waitUntilVisit", 1800, 80, { mode: "between" }),
      step("send-protocol", "sendCommunication", 2100, 0, send("visit_protocol")),
      step("wait-day-before", "waitUntilVisit", 2400, 80, { mode: "dayBefore" }),
      step("send-day-before", "sendCommunication", 2700, 0, send("visit_day_before")),
      step("wait-morning", "waitUntilVisit", 3000, 80, { mode: "morningOf" }),
      step("send-morning", "sendCommunication", 3300, 0, send("visit_morning")),
    ],
    edges: [
      { id: "e1", source: "trigger-1", target: "load-visit" },
      { id: "e2", source: "load-visit", target: "check-doctor" },
      { id: "e3", source: "check-doctor", target: "send-confirm", sourceHandle: "true" },
      { id: "e4", source: "send-confirm", target: "wait-testimonial" },
      { id: "e5", source: "wait-testimonial", target: "send-testimonial", sourceHandle: "due" },
      { id: "e6", source: "wait-testimonial", target: "wait-protocol", sourceHandle: "skip" },
      { id: "e7", source: "send-testimonial", target: "wait-protocol" },
      { id: "e8", source: "wait-protocol", target: "send-protocol", sourceHandle: "due" },
      { id: "e9", source: "wait-protocol", target: "wait-day-before", sourceHandle: "skip" },
      { id: "e10", source: "send-protocol", target: "wait-day-before" },
      { id: "e11", source: "wait-day-before", target: "send-day-before", sourceHandle: "due" },
      { id: "e12", source: "wait-day-before", target: "wait-morning", sourceHandle: "skip" },
      { id: "e13", source: "send-day-before", target: "wait-morning" },
      { id: "e14", source: "wait-morning", target: "send-morning", sourceHandle: "due" },
    ],
  };
}

async function seed() {
  assertVisitSchedule();

  const matches = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(and(ilike(user.name, "%ganguly%"), eq(user.banned, false)));
  const doctors = matches.filter((row) => row.role === "doctor");
  const chosen = doctors.length ? doctors : matches;
  if (chosen.length !== 1) {
    throw new Error(
      `Expected one Ganguly doctor, found ${chosen.length}: ${chosen.map((row) => row.name).join(", ") || "none"}`,
    );
  }
  const doctor = chosen[0]!;
  console.log(`Excluded doctor: ${doctor.name}`);

  const [existing] = await db
    .select({ id: automationFlow.id, status: automationFlow.status })
    .from(automationFlow)
    .where(eq(automationFlow.name, FLOW_NAME))
    .limit(1);
  if (existing) {
    console.log(`Flow already exists (${existing.id}, ${existing.status}).`);
    return;
  }

  const [flow] = await db
    .insert(automationFlow)
    .values({
      name: FLOW_NAME,
      triggerEventType: DomainEventType.APPOINTMENT_CREATED,
      status: "active",
      activatedAt: new Date(),
    })
    .returning();
  if (!flow) throw new Error("Failed to create flow");

  const built = graph(doctor.id);
  await db.insert(automationFlowVersion).values({
    flowId: flow.id,
    versionNumber: 1,
    nodes: built.nodes,
    edges: built.edges,
    isActive: true,
    publishedAt: new Date(),
  });
  console.log(`Flow active: ${flow.id}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

import "dotenv/config";
import { db } from "@workspace/db/client";
import { automationFlow, automationFlowVersion, automationSettings, communicationTemplate, user } from "@workspace/db/schema";
import { and, eq, ilike } from "@workspace/db";
import { DomainEventType } from "@workspace/db/domain-events";
import type { FlowGraph } from "./nodes/index";
import { assertVisitSchedule, formatVisitDate, formatVisitTime } from "./lib/visit-schedule";

// Dr. Apurba Ganguly's post-booking sequence. Starts when a visit is booked
// with him and nobody else. The five templates are created as drafts here;
// Meta approval is a separate submit:template call.
//
//   confirm now
//   day after booking, 10:00 — testimonial, skipped if that day is already
//     the day before the visit
//   one day in the gap, 10:00 — protocol, skipped when the visit is soon
//   day before, 10:00
//   morning of the visit, 9:00 (quiet hours end at 9)
//
// Get Directions opens OPTM Healthcare, Delhi:
// F-38, Block-F, South Extension-1, New Delhi 110049.

const FLOW_NAME = "Dr. Apurba Ganguly — visit reminders";

const DIRECTIONS = {
  type: "URL" as const,
  text: "Get Directions",
  url: "https://www.google.com/maps/search/?api=1&query=OPTM+Health+Care+F-38+Block-F+South+Extension-1+New+Delhi+110049",
};

const SAMPLE_AT = new Date("2026-10-12T10:30:00+05:30");
const SAMPLE_NAME = "Ankit Gaur";
const SAMPLE_DATE = formatVisitDate(SAMPLE_AT);
const SAMPLE_TIME = formatVisitTime(SAMPLE_AT);

const MEDIA = {
  experts: "https://s3.ap-south-1.amazonaws.com/predict.fit-643620726493-ap-south-1-an/public/media/9be2494f8b5bf419-pain-care-experts.png",
  testimonial: "https://s3.ap-south-1.amazonaws.com/predict.fit-643620726493-ap-south-1-an/public/media/64a28b837a4b5f75-day-2-build-trust-5-testimonial-together-3.mp4",
  protocol: "https://s3.ap-south-1.amazonaws.com/predict.fit-643620726493-ap-south-1-an/public/media/3c9de9ba25d8d3b5-day-4-supportive-nudge-avoid-knee-replacement-surgery-choose.mp4",
  dayBefore: "https://s3.ap-south-1.amazonaws.com/predict.fit-643620726493-ap-south-1-an/public/media/174db462c20a7d0c-day-6-nurture.mp4",
  morning: "https://s3.ap-south-1.amazonaws.com/predict.fit-643620726493-ap-south-1-an/public/media/a382929e19c1f23d-day-5-final-nudge.jpg",
};

const TEMPLATES = [
  {
    key: "ganguly_visit_confirmed",
    name: "Ganguly — booking confirmed",
    category: "appointmentReminders",
    wabaCategory: "UTILITY",
    headerType: "IMAGE",
    headerMediaType: "image",
    headerMediaUrl: MEDIA.experts,
    variablesSchema: ["name", "date", "time"],
    bodyExamples: [SAMPLE_NAME, SAMPLE_DATE, SAMPLE_TIME],
    ctaButtons: [DIRECTIONS],
    bodyText: [
      "Hi {{1}}, 👋",
      "",
      "Your OPTM consultation with *Dr. Apurba Ganguly* is confirmed.",
      "",
      "📅 *Date:* {{2}}",
      "⏰ *Time:* {{3}}",
      "",
      "During your visit, you'll receive a detailed AI-based muscle health assessment and meet an expert who will explain your results and help design a natural, personalized plan for you.",
    ].join("\n"),
  },
  {
    key: "ganguly_visit_testimonial",
    name: "Ganguly — patient experiences",
    category: "marketing",
    wabaCategory: "MARKETING",
    headerType: "VIDEO",
    headerMediaType: "video",
    headerMediaUrl: MEDIA.testimonial,
    variablesSchema: ["name"],
    bodyExamples: [SAMPLE_NAME],
    ctaButtons: [],
    bodyText: [
      "Hi {{1}}, 👋",
      "",
      "Every patient's journey is different, and hearing from others can help you understand what to expect.",
      "",
      "Here are real patient experiences from people who have visited OPTM.",
    ].join("\n"),
  },
  {
    key: "ganguly_visit_protocol",
    name: "Ganguly — what to expect",
    category: "marketing",
    wabaCategory: "MARKETING",
    headerType: "VIDEO",
    headerMediaType: "video",
    headerMediaUrl: MEDIA.protocol,
    variablesSchema: ["name"],
    bodyExamples: [SAMPLE_NAME],
    ctaButtons: [],
    bodyText: [
      "Hi {{1}}, 👋",
      "",
      "Your OPTM consultation with *Dr. Apurba Ganguly* is coming up.",
      "",
      "Before your visit, we'd like to share a little more about how we approach muscle health and what you can expect from your consultation.",
    ].join("\n"),
  },
  {
    key: "ganguly_visit_day_before",
    name: "Ganguly — day before",
    category: "appointmentReminders",
    wabaCategory: "UTILITY",
    headerType: "VIDEO",
    headerMediaType: "video",
    headerMediaUrl: MEDIA.dayBefore,
    variablesSchema: ["name"],
    bodyExamples: [SAMPLE_NAME],
    ctaButtons: [],
    bodyText: [
      "Hi {{1}}, 👋",
      "",
      "Friendly reminder: your OPTM consultation is *tomorrow*.",
      "",
      "Please arrive *10 minutes early* for a smooth experience.",
      "",
      "During your visit, you'll go through a detailed assessment and consultation, followed by a personalized treatment plan based on your assessment.",
    ].join("\n"),
  },
  {
    key: "ganguly_visit_morning",
    name: "Ganguly — morning of the visit",
    category: "appointmentReminders",
    wabaCategory: "UTILITY",
    headerType: "IMAGE",
    headerMediaType: "image",
    headerMediaUrl: MEDIA.morning,
    variablesSchema: ["name", "time"],
    bodyExamples: [SAMPLE_NAME, SAMPLE_TIME],
    ctaButtons: [DIRECTIONS],
    bodyText: [
      "Good morning, {{1}} 🌞",
      "",
      "Your OPTM appointment with *Dr. Apurba Ganguly* is today at *{{2}}*.",
      "",
      "Please bring your previous medical reports and arrive *10 minutes early* for a smooth experience.",
      "",
      "We look forward to seeing you today.",
    ].join("\n"),
  },
];

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

function graph(doctorUserId: string, doctorName: string): FlowGraph {
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
        operator: "eq",
        value: doctorUserId,
        label: `Doctor is ${doctorName}`,
      }),
      step("send-confirm", "sendCommunication", 900, 80, send("ganguly_visit_confirmed", true)),
      step("wait-testimonial", "waitUntilVisit", 1200, 80, { mode: "dayAfterBooking" }),
      step("send-testimonial", "sendCommunication", 1500, 0, send("ganguly_visit_testimonial")),
      step("wait-protocol", "waitUntilVisit", 1800, 80, { mode: "between" }),
      step("send-protocol", "sendCommunication", 2100, 0, send("ganguly_visit_protocol")),
      step("wait-day-before", "waitUntilVisit", 2400, 80, { mode: "dayBefore" }),
      step("send-day-before", "sendCommunication", 2700, 0, send("ganguly_visit_day_before")),
      step("wait-morning", "waitUntilVisit", 3000, 80, { mode: "morningOf" }),
      step("send-morning", "sendCommunication", 3300, 0, send("ganguly_visit_morning")),
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

async function seedTemplates() {
  let created = 0;
  for (const template of TEMPLATES) {
    const inserted = await db
      .insert(communicationTemplate)
      .values({
        key: template.key,
        name: template.name,
        channel: "whatsapp",
        category: template.category,
        providerTemplateName: template.key,
        variablesSchema: template.variablesSchema,
        ctaButtons: template.ctaButtons,
        headerMediaUrl: template.headerMediaUrl,
        headerMediaType: template.headerMediaType,
        wabaCategory: template.wabaCategory,
        language: "en_US",
        headerType: template.headerType,
        bodyText: template.bodyText,
        bodyExamples: template.bodyExamples,
        submissionStatus: "draft",
      })
      .onConflictDoNothing({ target: communicationTemplate.key })
      .returning({ key: communicationTemplate.key });
    if (inserted.length) created += 1;
  }
  console.log(`Templates: ${created} created, ${TEMPLATES.length - created} already there.`);
  console.log(`Sample date/time sent as "${SAMPLE_DATE}" / "${SAMPLE_TIME}".`);
}

async function seed() {
  assertVisitSchedule();
  await seedTemplates();

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
  console.log(`Doctor: ${doctor.name}`);
  const [hours] = await db
    .select({
      enabled: automationSettings.quietHoursEnabled,
      start: automationSettings.quietStartHour,
      end: automationSettings.quietEndHour,
      timezone: automationSettings.timezone,
    })
    .from(automationSettings)
    .limit(1);
  if (hours) {
    console.log(
      `Quiet hours: ${hours.enabled ? `${hours.start}:00–${hours.end}:00` : "off"} (${hours.timezone}). Morning message is 9:00.`,
    );
  }

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

  const built = graph(doctor.id, doctor.name);
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

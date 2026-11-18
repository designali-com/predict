import { db } from "@workspace/db/client";
import { appointment, automationFlow, communicationMessage, contact } from "@workspace/db/schema";
import { and, eq, gt } from "@workspace/db";
import { leadRegion } from "@workspace/db/lead-region";

/**
 * When a lead stops being a lead to chase.
 *
 * A flow that starts on a new lead (LEAD_STATUS_NEW / LEAD_CAPTURED) is a
 * nurture: it keeps writing to somebody we have not managed to reach. It must
 * stop the moment that stops being true — the telecaller got through, they
 * wrote back, they booked, they said no — or they get "we couldn't connect
 * with you" the day after their visit. Flows do not have to draw that check
 * before every message; the engine asks here before each send.
 */

/** Trigger events that make a flow a lead nurture. */
const NURTURE_TRIGGERS = new Set(["LEAD_STATUS_NEW", "LEAD_CAPTURED"]);

/** Statuses that still mean "we have not got through to them". */
const STILL_UNREACHED = new Set(["NEW", "NO_ANSWER", "NOT_REACHABLE", "CALLBACK_LATER"]);

/** Node types that message the contact. */
export const MESSAGING_NODES = new Set(["sendCommunication", "sendText", "nurtureStep"]);

const flowTrigger = new Map<string, string | null>();

export async function isNurtureFlow(flowId: string): Promise<boolean> {
  if (!flowTrigger.has(flowId)) {
    const [flow] = await db
      .select({ trigger: automationFlow.triggerEventType })
      .from(automationFlow)
      .where(eq(automationFlow.id, flowId))
      .limit(1);
    flowTrigger.set(flowId, flow?.trigger ?? null);
  }
  return NURTURE_TRIGGERS.has(flowTrigger.get(flowId) ?? "");
}

/**
 * Why this lead should no longer get nurture messages, or null to carry on.
 * `since` is when the run started: a reply or a booking after it ends it.
 */
export async function nurtureStopReason(contactId: string | null, since: Date): Promise<string | null> {
  if (!contactId) return "no contact";
  const [person] = await db
    .select({ stage: contact.stage, leadStatus: contact.leadStatus, campaign: contact.campaign, city: contact.city })
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);
  if (!person) return "contact removed";
  if (person.stage !== "LEAD") return `now a ${person.stage.toLowerCase()}`;
  // OPTM's follow-up is for its Delhi clinic. A Kolkata lead (a "| Kol |"
  // campaign, or a Kolkata-area city) gets none of it: the run stops before
  // its first message, and any run already going stops before its next one.
  if (leadRegion(person) === "KOLKATA") return "Kolkata lead";
  if (person.leadStatus && !STILL_UNREACHED.has(person.leadStatus)) return `lead status is ${person.leadStatus}`;

  const [replied] = await db
    .select({ id: communicationMessage.id })
    .from(communicationMessage)
    .where(
      and(
        eq(communicationMessage.contactId, contactId),
        eq(communicationMessage.direction, "inbound"),
        gt(communicationMessage.createdAt, since),
      ),
    )
    .limit(1);
  if (replied) return "they replied";

  const [booked] = await db
    .select({ id: appointment.id })
    .from(appointment)
    .where(and(eq(appointment.contactId, contactId), gt(appointment.createdAt, since)))
    .limit(1);
  if (booked) return "they booked an appointment";

  return null;
}

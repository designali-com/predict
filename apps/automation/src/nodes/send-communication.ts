import { sendCommunication } from "@workspace/communication";
import { db } from "@workspace/db/client";
import { appointment, communicationTemplate, contact } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { getAutomationSettings, nextOpenTime } from "@workspace/db/automation-settings";
import { formatVisitDate, formatVisitTime } from "../lib/visit-schedule";
import type { FlowNode, NodeExecutor, RunContext } from "./types";

interface SendCommunicationConfig {
  templateKey: string;
  channel?: string;
  /**
   * Send even at night. For the rare message that is genuinely urgent to the
   * person (an appointment in the morning), not for marketing.
   */
  ignoreQuietHours?: boolean;
  /**
   * Read the visit at send time and don't send if it was cancelled, completed,
   * or never existed. Date and time in the template come from that same read,
   * so a reschedule is what the message says.
   */
  requireUpcomingVisit?: boolean;
}

/** Placeholder a template key may contain, replaced with the lead's interest. */
const INTEREST_TOKEN = "{interest}";
/** What {interest} falls back to when the lead has none, or no template exists for it. */
const GENERAL_INTEREST = "general";

async function templateExists(key: string): Promise<boolean> {
  return !!(await declaredVariables(key));
}

/** The names a template declares for {{1}}, {{2}}...; null if no such template. */
async function declaredVariables(key: string): Promise<string[] | null> {
  const [row] = await db
    .select({ schema: communicationTemplate.variablesSchema })
    .from(communicationTemplate)
    .where(eq(communicationTemplate.key, key))
    .limit(1);
  if (!row) return null;
  return Array.isArray(row.schema) ? row.schema.filter((n): n is string => typeof n === "string") : [];
}

/**
 * "lead_day1_{interest}" -> "lead_day1_knee_pain", or "lead_day1_general"
 * when there is no knee-pain version. One flow then serves every ad topic:
 * adding a topic is adding its templates, not another branch of the flow.
 */
const UPCOMING = new Set(["scheduled", "confirmed"]);

async function liveVisit(appointmentId: unknown): Promise<{ date: string; time: string; status: string } | null> {
  if (typeof appointmentId !== "string") return null;
  const [row] = await db
    .select({ scheduledAt: appointment.scheduledAt, status: appointment.status })
    .from(appointment)
    .where(eq(appointment.id, appointmentId))
    .limit(1);
  if (!row) return null;
  return { date: formatVisitDate(row.scheduledAt), time: formatVisitTime(row.scheduledAt), status: row.status };
}

async function resolveTemplateKey(key: string, interest: string | null): Promise<string> {
  if (!key.includes(INTEREST_TOKEN)) return key;
  if (interest) {
    const specific = key.replaceAll(INTEREST_TOKEN, interest);
    if (await templateExists(specific)) return specific;
  }
  return key.replaceAll(INTEREST_TOKEN, GENERAL_INTEREST);
}

/**
 * Values every template can use without a Variable node: the person's name,
 * city, interest and owner, read fresh from the contact. The trigger's own
 * payload comes next, and anything a flow set explicitly in
 * context.variables wins over both.
 */
function baseVariables(row: typeof contact.$inferSelect | undefined, context: RunContext) {
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (typeof v === "string" || typeof v === "number") flat[k] = v;
  }
  const name = row?.name ?? (typeof context.name === "string" ? context.name : "")
  return {
    ...flat,
    name: name || "there",
    firstName: name.split(/\s+/)[0] || "there",
    city: row?.city ?? flat.city ?? "",
    interest: (row?.interest ?? String(flat.interest ?? "")).replace(/_/g, " "),
  };
}

export const sendCommunicationExecutor: NodeExecutor = {
  async execute(node: FlowNode, context: RunContext) {
    const config = node.data.config as SendCommunicationConfig;
    const contactId = context.contactId;
    if (typeof contactId !== "string") {
      throw new Error("Send Communication node: no contactId in run context");
    }

    // Nobody wants a marketing message at 2am, and the ones who get one
    // block the number — which costs every future lead, not just this one.
    // The run parks itself until morning instead.
    if (!config.ignoreQuietHours) {
      const [who] = await db
        .select({ clinicId: contact.clinicId })
        .from(contact)
        .where(eq(contact.id, contactId))
        .limit(1);
      const settings = await getAutomationSettings(db, who?.clinicId);
      const resumeAt = nextOpenTime(settings);
      if (resumeAt) {
        return {
          output: { deferred: true, resumeAt: resumeAt.toISOString(), reason: "quiet hours" },
          // Stay on this send. Advancing would skip the message and run the
          // next step when morning comes.
          suspend: { kind: "delay", resumeAt, stay: true },
        };
      }
    }

    const [row] = await db.select().from(contact).where(eq(contact.id, contactId)).limit(1);
    const interest = row?.interest ?? (typeof context.interest === "string" && context.interest ? context.interest : null);
    const templateKey = await resolveTemplateKey(config.templateKey, interest);

    // Only the names the template declares. A template without a named
    // variablesSchema falls back to positional order in sendCommunication,
    // and handing it a dozen unasked-for values would fill {{1}} with
    // whichever happened to come first.
    const declared = (await declaredVariables(templateKey)) ?? [];
    const wantsVisit = config.requireUpcomingVisit || declared.some((n) => n === "date" || n === "time");
    const visit = wantsVisit ? await liveVisit(context.appointmentId) : null;
    if (config.requireUpcomingVisit && (!visit || !UPCOMING.has(visit.status))) {
      return { output: { skipped: true, reason: "visit is not upcoming", templateKey } };
    }
    const base: Record<string, unknown> = {
      ...baseVariables(row, context),
      ...(visit ? { date: visit.date, time: visit.time } : {}),
    };

    const automatic = Object.fromEntries(declared.filter((n) => n in base).map((n) => [n, base[n]]));

    const result = await sendCommunication({
      contactId,
      runId: typeof context.runId === "string" ? context.runId : undefined,
      templateKey,
      channel: config.channel,
      variables: {
        ...automatic,
        ...((context.variables as Record<string, unknown>) ?? {}),
      },
    });

    return { output: { ...result, templateKey } };
  },
};

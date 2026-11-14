import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { appointment, clinic, contact, stageMessageDoctorTemplate, stageMessageRule, stageMessageSetting, user } from "./schema";
import type * as schema from "./schema";
import { DomainEventType } from "./domain-events";

type Db = NodePgDatabase<typeof schema>;

/**
 * Stage messages — the single WhatsApp message each lead or appointment
 * moment always gets ("we couldn't reach you", "your appointment is
 * confirmed" …).
 *
 * The moments are fixed here, in code: each is one domain event the rest of
 * the system already emits. What is configurable, on the Stage Messages page,
 * is whether it sends, which approved template, and after how long. Sending
 * goes through the automation worker and the same sendCommunication as every
 * flow, so consent, quiet hours and template approval are checked the same
 * way.
 *
 * Sequences (a 7-day nurture, re-engagement every week) are not moments —
 * they stay flows.
 */

export type StageVariable =
  | "name"
  | "firstName"
  | "city"
  | "interest"
  | "appointmentDate"
  | "appointmentTime"
  | "doctorName"
  | "clinicName"
  | "clinicAddress"
  | "visitMode"
  | "previousAppointmentDate"
  | "previousAppointmentTime"
  | "callbackDate"
  | "callbackTime";

export const VARIABLE_LABELS: Record<StageVariable, string> = {
  name: "Full name",
  firstName: "First name",
  city: "City",
  interest: "Interest",
  appointmentDate: "Appointment date",
  appointmentTime: "Appointment time",
  doctorName: "Doctor",
  clinicName: "Clinic name",
  clinicAddress: "Clinic address",
  visitMode: "In clinic / Online",
  previousAppointmentDate: "Old appointment date",
  previousAppointmentTime: "Old appointment time",
  callbackDate: "Callback date",
  callbackTime: "Callback time",
};

const PERSON: StageVariable[] = ["name", "firstName", "city", "interest"];
const VISIT: StageVariable[] = [
  "appointmentDate",
  "appointmentTime",
  "doctorName",
  "clinicName",
  "clinicAddress",
  "visitMode",
];

export interface StageTrigger {
  key: string;
  group: "Calls" | "Appointments";
  label: string;
  /** When it fires, in words, for the page. */
  when: string;
  eventType: string;
  /** What a template for this moment can use, by variablesSchema name. */
  variables: StageVariable[];
}

export const STAGE_MESSAGE_TRIGGERS: StageTrigger[] = [
  {
    key: "call_not_connected",
    group: "Calls",
    label: "Call not connected",
    when: "A caller marks the lead \"No answer\"",
    eventType: DomainEventType.LEAD_STATUS_NO_ANSWER,
    variables: [...PERSON, "clinicName"],
  },
  {
    key: "call_not_reachable",
    group: "Calls",
    label: "Phone switched off or busy",
    when: "A caller marks the lead \"Switched off / busy\"",
    eventType: DomainEventType.LEAD_STATUS_NOT_REACHABLE,
    variables: [...PERSON, "clinicName"],
  },
  {
    key: "call_rescheduled",
    group: "Calls",
    label: "Call rescheduled",
    when: "A caller marks the lead \"Call back later\" with a time",
    eventType: DomainEventType.LEAD_STATUS_CALLBACK_LATER,
    variables: [...PERSON, "callbackDate", "callbackTime"],
  },
  {
    key: "appointment_booked",
    group: "Appointments",
    label: "Appointment booking",
    when: "An appointment is booked — by staff, the patient app or a flow",
    eventType: DomainEventType.APPOINTMENT_CREATED,
    variables: [...PERSON, ...VISIT],
  },
  {
    key: "appointment_confirmed",
    group: "Appointments",
    label: "Appointment confirmation",
    when: "An appointment is marked confirmed",
    eventType: DomainEventType.APPOINTMENT_CONFIRMED,
    variables: [...PERSON, ...VISIT],
  },
  {
    key: "appointment_missed",
    group: "Appointments",
    label: "Appointment missed",
    when: "An appointment is marked no-show",
    eventType: DomainEventType.APPOINTMENT_NO_SHOW,
    variables: [...PERSON, ...VISIT],
  },
  {
    key: "appointment_rescheduled",
    group: "Appointments",
    label: "Reschedule confirmation",
    when: "An appointment is moved to a new time",
    eventType: DomainEventType.APPOINTMENT_RESCHEDULED,
    variables: [...PERSON, ...VISIT, "previousAppointmentDate", "previousAppointmentTime"],
  },
];

export function stageTrigger(key: string): StageTrigger | undefined {
  return STAGE_MESSAGE_TRIGGERS.find((t) => t.key === key);
}

export function triggersForEvent(eventType: string): StageTrigger[] {
  return STAGE_MESSAGE_TRIGGERS.filter((t) => t.eventType === eventType);
}

export type StageRule = typeof stageMessageRule.$inferSelect;

/** Every moment, with its saved rule if it has one. */
export async function listStageRules(db: Db) {
  const rows = await db.select().from(stageMessageRule);
  const byKey = new Map(rows.map((r) => [r.triggerKey, r]));
  return STAGE_MESSAGE_TRIGGERS.map((trigger) => ({ trigger, rule: byKey.get(trigger.key) ?? null }));
}

export async function stageRule(db: Db, triggerKey: string): Promise<StageRule | null> {
  const [row] = await db.select().from(stageMessageRule).where(eq(stageMessageRule.triggerKey, triggerKey)).limit(1);
  return row ?? null;
}

export interface StageRulePatch {
  enabled?: boolean;
  templateKey?: string | null;
  delayMinutes?: number;
  respectQuietHours?: boolean;
}

/**
 * Save a moment's settings. Switching it on stamps enabledAt, so only what
 * happens from then on is sent — never the backlog.
 */
export async function saveStageRule(db: Db, triggerKey: string, patch: StageRulePatch, userId: string | null) {
  if (!stageTrigger(triggerKey)) throw new Error(`Unknown stage message "${triggerKey}"`);
  const existing = await stageRule(db, triggerKey);
  const now = new Date();
  const turningOn = patch.enabled === true && !existing?.enabled;

  const values = {
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.templateKey !== undefined ? { templateKey: patch.templateKey } : {}),
    ...(patch.delayMinutes !== undefined ? { delayMinutes: Math.max(0, Math.round(patch.delayMinutes)) } : {}),
    ...(patch.respectQuietHours !== undefined ? { respectQuietHours: patch.respectQuietHours } : {}),
    ...(turningOn ? { enabledAt: now } : {}),
    updatedByUserId: userId,
    updatedAt: now,
  };

  if (existing) {
    const [row] = await db.update(stageMessageRule).set(values).where(eq(stageMessageRule.id, existing.id)).returning();
    return row!;
  }
  const [row] = await db.insert(stageMessageRule).values({ triggerKey, ...values }).returning();
  return row!;
}

const GLOBAL = "global";

export async function stageMessagesPaused(db: Db): Promise<boolean> {
  const [row] = await db.select().from(stageMessageSetting).where(eq(stageMessageSetting.id, GLOBAL)).limit(1);
  return row?.paused ?? false;
}

export async function setStageMessagesPaused(db: Db, paused: boolean, userId: string | null) {
  await db
    .insert(stageMessageSetting)
    .values({ id: GLOBAL, paused, updatedByUserId: userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: stageMessageSetting.id,
      set: { paused, updatedByUserId: userId, updatedAt: new Date() },
    });
}

const ZONE = "Asia/Kolkata";
const dateOf = (d: Date) =>
  d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: ZONE });
const timeOf = (d: Date) =>
  d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ZONE });

function asDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Everything a template for this moment can say, filled in for one event.
 * Missing values come back as "" — sendCommunication only uses the names the
 * chosen template declares.
 */
export async function stageMessageVariables(
  db: Db,
  trigger: StageTrigger,
  contactId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, string>> {
  const [person] = await db.select().from(contact).where(eq(contact.id, contactId)).limit(1);
  const name = (person?.name ?? (typeof payload.name === "string" ? payload.name : "")).trim();
  const out: Record<string, string> = {
    name: name || "there",
    firstName: name.split(/\s+/)[0] || "there",
    city: person?.city ?? "",
    interest: (person?.interest ?? "").replace(/_/g, " "),
  };

  if (trigger.variables.includes("callbackDate")) {
    const at = asDate(payload.callbackAt) ?? person?.callbackAt ?? null;
    out.callbackDate = at ? dateOf(at) : "";
    out.callbackTime = at ? timeOf(at) : "";
  }

  if (trigger.variables.includes("appointmentDate") && typeof payload.appointmentId === "string") {
    const [visit] = await db
      .select({
        scheduledAt: appointment.scheduledAt,
        channel: appointment.channel,
        doctorName: user.name,
        clinicName: clinic.name,
        line1: clinic.addressLine1,
        line2: clinic.addressLine2,
        clinicCity: clinic.city,
      })
      .from(appointment)
      .leftJoin(user, eq(user.id, appointment.doctorUserId))
      .leftJoin(clinic, eq(clinic.id, appointment.clinicId))
      .where(eq(appointment.id, payload.appointmentId))
      .limit(1);
    // The payload's time wins for a reschedule: it is the new one even if the
    // row has moved again since.
    const at = asDate(payload.scheduledAt) ?? visit?.scheduledAt ?? null;
    out.appointmentDate = at ? dateOf(at) : "";
    out.appointmentTime = at ? timeOf(at) : "";
    out.doctorName = visit?.doctorName ?? "";
    out.clinicName = visit?.clinicName ?? "";
    out.clinicAddress = [visit?.line1, visit?.line2, visit?.clinicCity].filter(Boolean).join(", ");
    out.visitMode = visit?.channel === "virtual" ? "Online" : "In clinic";

    const before = asDate(payload.previousScheduledAt);
    out.previousAppointmentDate = before ? dateOf(before) : "";
    out.previousAppointmentTime = before ? timeOf(before) : "";
  }

  // A missed call has no visit, so the clinic is the one the lead belongs to.
  if (trigger.variables.includes("clinicName") && !out.clinicName) {
    if (person?.clinicId) {
      const [home] = await db.select({ name: clinic.name }).from(clinic).where(eq(clinic.id, person.clinicId)).limit(1);
      out.clinicName = home?.name?.trim() ?? "";
    }
    if (!out.clinicName) out.clinicName = "Predict";
  }

  return out;
}

export async function listDoctorTemplates(db: Db) {
  return db
    .select({
      triggerKey: stageMessageDoctorTemplate.triggerKey,
      doctorUserId: stageMessageDoctorTemplate.doctorUserId,
      doctorName: user.name,
      templateKey: stageMessageDoctorTemplate.templateKey,
    })
    .from(stageMessageDoctorTemplate)
    .leftJoin(user, eq(user.id, stageMessageDoctorTemplate.doctorUserId));
}

/** The template for this person on this moment, or null when they use the generic one. */
export async function doctorTemplateKey(db: Db, triggerKey: string, doctorUserId: string): Promise<string | null> {
  const [row] = await db
    .select({ templateKey: stageMessageDoctorTemplate.templateKey })
    .from(stageMessageDoctorTemplate)
    .where(
      and(
        eq(stageMessageDoctorTemplate.triggerKey, triggerKey),
        eq(stageMessageDoctorTemplate.doctorUserId, doctorUserId),
      ),
    )
    .limit(1);
  return row?.templateKey ?? null;
}

export async function saveDoctorTemplate(db: Db, triggerKey: string, doctorUserId: string, templateKey: string) {
  if (!stageTrigger(triggerKey)) throw new Error(`Unknown stage message "${triggerKey}"`);
  const [row] = await db
    .insert(stageMessageDoctorTemplate)
    .values({ triggerKey, doctorUserId, templateKey, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [stageMessageDoctorTemplate.triggerKey, stageMessageDoctorTemplate.doctorUserId],
      set: { templateKey, updatedAt: new Date() },
    })
    .returning();
  return row!;
}

export async function removeDoctorTemplate(db: Db, triggerKey: string, doctorUserId: string) {
  await db
    .delete(stageMessageDoctorTemplate)
    .where(
      and(
        eq(stageMessageDoctorTemplate.triggerKey, triggerKey),
        eq(stageMessageDoctorTemplate.doctorUserId, doctorUserId),
      ),
    );
}

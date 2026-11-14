import { db } from "@workspace/db/client";
import { communicationTemplate, contact, lifecycleEvent, stageMessageRule, stageMessageSend, appointment } from "@workspace/db/schema";
import { and, eq, lte, sql } from "@workspace/db";
import { sendCommunication } from "@workspace/communication";
import { getAutomationSettings, nextOpenTime } from "@workspace/db/automation-settings";
import {
  stageMessagesPaused,
  stageMessageVariables,
  stageTrigger,
  triggersForEvent,
  doctorTemplateKey,
} from "@workspace/db/stage-messages";
import { flowQueue } from "./queue";

/**
 * Stage messages in the worker: the event poll hands each new event here, a
 * matching switched-on moment is claimed once (stage_message_send) and queued
 * on the same Redis queue as flow runs, with the moment's delay. Everything
 * that could have changed in the meantime — the switch, the template, its
 * approval, the time of night — is checked again when the job runs, not when
 * it was queued.
 */

type LifecycleEvent = typeof lifecycleEvent.$inferSelect;

export async function queueStageMessages(event: LifecycleEvent): Promise<void> {
  const triggers = triggersForEvent(event.type);
  if (triggers.length === 0 || !event.contactId) return;
  if (await stageMessagesPaused(db)) return;

  for (const trigger of triggers) {
    const [rule] = await db
      .select()
      .from(stageMessageRule)
      .where(eq(stageMessageRule.triggerKey, trigger.key))
      .limit(1);
    if (!rule?.enabled || !rule.templateKey) continue;
    // Only what happened after it was switched on — never the backlog.
    if (!rule.enabledAt || event.occurredAt < rule.enabledAt) continue;

    const sendAt = new Date(event.occurredAt.getTime() + rule.delayMinutes * 60_000);
    const [claimed] = await db
      .insert(stageMessageSend)
      .values({
        lifecycleEventId: event.id,
        ruleId: rule.id,
        contactId: event.contactId,
        templateKey: rule.templateKey,
        status: "queued",
        sendAt,
      })
      .onConflictDoNothing()
      .returning({ id: stageMessageSend.id });
    // Already claimed on an earlier poll tick.
    if (!claimed) continue;

    await flowQueue.add(
      "stage-message",
      { kind: "stage-message", sendId: claimed.id },
      { jobId: `stage-${claimed.id}`, delay: Math.max(0, sendAt.getTime() - Date.now()) },
    );
  }
}

async function finish(sendId: string, status: "sent" | "skipped" | "failed", detail: string | null, templateKey?: string) {
  await db
    .update(stageMessageSend)
    .set({ status, detail, ...(templateKey ? { templateKey } : {}), ...(status === "sent" ? { sentAt: new Date() } : {}) })
    .where(eq(stageMessageSend.id, sendId));
}

export async function runStageMessage(sendId: string): Promise<void> {
  // The queue job and the rescue both call this. Only the one that still
  // sees "queued" sends, so a lead is not messaged twice.
  const [send] = await db
    .update(stageMessageSend)
    .set({ status: "sending", detail: new Date().toISOString() })
    .where(and(eq(stageMessageSend.id, sendId), eq(stageMessageSend.status, "queued")))
    .returning();
  if (!send || !send.contactId) return;

  try {
    await deliverStageMessage(send);
  } catch (err) {
    await db
      .update(stageMessageSend)
      .set({ status: "queued", detail: err instanceof Error ? err.message : "send failed" })
      .where(and(eq(stageMessageSend.id, sendId), eq(stageMessageSend.status, "sending")));
    throw err;
  }
}

async function deliverStageMessage(send: typeof stageMessageSend.$inferSelect): Promise<void> {
  const sendId = send.id;
  if (!send.contactId) return;

  const [rule] = await db.select().from(stageMessageRule).where(eq(stageMessageRule.id, send.ruleId)).limit(1);
  const trigger = rule ? stageTrigger(rule.triggerKey) : undefined;
  if (!rule || !trigger) return finish(sendId, "skipped", "moment no longer exists");
  if (await stageMessagesPaused(db)) return finish(sendId, "skipped", "all stage messages paused");
  if (!rule.enabled) return finish(sendId, "skipped", "switched off before it was due");

  const [event] = await db.select().from(lifecycleEvent).where(eq(lifecycleEvent.id, send.lifecycleEventId)).limit(1);
  let payload: Record<string, unknown> = {};
  try {
    payload = event ? JSON.parse(event.payload) : {};
  } catch {
    // an unreadable payload still gets the contact's own details
  }

  // The card's default template, unless this visit is with a doctor who has
  // their own. The appointment row is the fallback: not every booking event
  // copies the doctor onto the payload.
  let templateKey = rule.templateKey;
  let doctorUserId = typeof payload.doctorUserId === "string" ? payload.doctorUserId : null;
  if (!doctorUserId && typeof payload.appointmentId === "string") {
    const [visit] = await db
      .select({ doctorUserId: appointment.doctorUserId })
      .from(appointment)
      .where(eq(appointment.id, payload.appointmentId))
      .limit(1);
    doctorUserId = visit?.doctorUserId ?? null;
  }
  if (doctorUserId) {
    const special = await doctorTemplateKey(db, rule.triggerKey, doctorUserId);
    if (special) templateKey = special;
  }
  if (!templateKey) return finish(sendId, "skipped", "no template chosen");

  const [template] = await db
    .select()
    .from(communicationTemplate)
    .where(eq(communicationTemplate.key, templateKey))
    .limit(1);
  if (!template) return finish(sendId, "skipped", `template "${templateKey}" no longer exists`, templateKey);
  if (template.submissionStatus !== "approved") {
    return finish(sendId, "skipped", `template "${templateKey}" is ${template.submissionStatus}, not approved`, templateKey);
  }

  if (rule.respectQuietHours) {
    const [who] = await db.select({ clinicId: contact.clinicId }).from(contact).where(eq(contact.id, send.contactId)).limit(1);
    const openAt = nextOpenTime(await getAutomationSettings(db, who?.clinicId));
    if (openAt) {
      // Still queued — the same job id cannot be reused, so a new one for the morning.
      await db
        .update(stageMessageSend)
        .set({ status: "queued", sendAt: openAt, detail: "waiting for quiet hours to end" })
        .where(eq(stageMessageSend.id, sendId));
      await flowQueue.add(
        "stage-message",
        { kind: "stage-message", sendId },
        { jobId: `stage-${sendId}-${openAt.getTime()}`, delay: Math.max(0, openAt.getTime() - Date.now()) },
      );
      return;
    }
  }

  const available = await stageMessageVariables(db, trigger, send.contactId, payload);
  const declared = Array.isArray(template.variablesSchema)
    ? template.variablesSchema.filter((n): n is string => typeof n === "string")
    : [];
  const variables = Object.fromEntries(declared.map((n) => [n, available[n] ?? ""]));

  const result = await sendCommunication({ contactId: send.contactId, templateKey, variables });

  if (result.status === "failed") return finish(sendId, "failed", result.error ?? "provider refused the message", templateKey);
  if (result.status === "skipped_no_consent") return finish(sendId, "skipped", "contact has opted out of these messages", templateKey);

  await finish(sendId, "sent", null, templateKey);
  await db
    .update(stageMessageRule)
    .set({ lastSentAt: new Date(), sentCount: sql`${stageMessageRule.sentCount} + 1` })
    .where(and(eq(stageMessageRule.id, rule.id)));
}

// A queued stage message whose job never ran. The claim inside
// runStageMessage keeps this from sending a second copy if the job shows up late.
const STAGE_RESCUE_AFTER_MS = 45_000;

export async function rescueQueuedStageMessages(): Promise<number> {
  const cutoff = new Date(Date.now() - STAGE_RESCUE_AFTER_MS);
  // A send that claimed the row and then died. The detail is the claim time;
  // a live send finishes well inside two minutes.
  await db.execute(sql`
    update stage_message_send
    set status = 'queued', detail = 'retrying a send that did not finish'
    where status = 'sending'
      and detail ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      and detail::timestamptz < now() - interval '2 minutes'
  `);

  const due = await db
    .select({ id: stageMessageSend.id })
    .from(stageMessageSend)
    .where(and(eq(stageMessageSend.status, "queued"), lte(stageMessageSend.sendAt, cutoff)))
    .limit(20);

  let sent = 0;
  for (const row of due) {
    try {
      await runStageMessage(row.id);
      sent += 1;
    } catch (err) {
      console.error(`[stage-messages] rescue ${row.id} failed:`, err);
    }
  }
  return sent;
}

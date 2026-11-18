import { db } from "@workspace/db/client";
import { contact, task } from "@workspace/db/schema";
import { and, eq, inArray, isNotNull, isNull, lte, sql } from "@workspace/db";
import { TIMED_STATUSES } from "@workspace/db/lead-status";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { getAutomationSettings } from "@workspace/db/automation-settings";
import { listClinics } from "@workspace/db/clinic-service";

/**
 * The checks nobody performs by hand.
 *
 * Each one writes a marker column when it acts, so running every minute does
 * not mean reminding somebody every minute. They are deliberately small and
 * independent: one failing must not stop the others.
 */

const BATCH = 100;

/**
 * Runs a check once per clinic, with that clinic's own settings.
 *
 * Each clinic sets its own first-response window and its own quiet hours —
 * Kolkata opening an hour earlier than Delhi is a setting, not a deploy — so
 * the sweeps cannot read one global row any more.
 */
async function perClinic(run: (clinicId: string) => Promise<number>): Promise<number> {
  const clinics = await listClinics(db);
  let acted = 0;
  for (const clinic of clinics) {
    try {
      acted += await run(clinic.id);
    } catch (err) {
      // One clinic's bad setting must not stop the others being checked.
      console.error(`[automation] sweep failed for clinic ${clinic.name}:`, err);
    }
  }
  return acted;
}

/** "Call me back at 5" — at 5, tell the person who promised. */
export async function callbackSweep(): Promise<number> {
  return perClinic(callbackSweepFor);
}

async function callbackSweepFor(clinicId: string): Promise<number> {
  const settings = await getAutomationSettings(db, clinicId);
  if (!settings.callbackReminders) return 0;

  const due = await db
    .select({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      callbackAt: contact.callbackAt,
      assignedUserId: contact.assignedUserId,
      assignedRole: contact.assignedRole,
      clinicId: contact.clinicId,
    })
    .from(contact)
    .where(
      and(
        isNotNull(contact.callbackAt),
        lte(contact.callbackAt, new Date()),
        isNull(contact.callbackRemindedAt),
        // A "try again at" on a call that did not connect reminds the same way.
        inArray(contact.leadStatus, TIMED_STATUSES),
        eq(contact.clinicId, clinicId),
      ),
    )
    .limit(BATCH);

  for (const lead of due) {
    // Marker first: if the task insert fails, we would rather miss a reminder
    // than raise the same one every minute until someone notices.
    await db.update(contact).set({ callbackRemindedAt: new Date() }).where(eq(contact.id, lead.id));

    await db.insert(task).values({
      contactId: lead.id,
      clinicId: lead.clinicId,
      type: "callback",
      title: `Call back now: ${lead.name ?? lead.phone ?? "lead"}`,
      notes: `They asked to be called at ${lead.callbackAt?.toLocaleString("en-IN") ?? "this time"}.`,
      assignedUserId: lead.assignedUserId,
      assignedRole: lead.assignedRole,
      dueAt: lead.callbackAt,
    });

    await emitDomainEvent(
      db,
      DomainEventType.CALLBACK_DUE,
      { contactId: lead.id, name: lead.name ?? "", callbackAt: lead.callbackAt?.toISOString() ?? "" },
      { contactId: lead.id, idempotencyKey: `callback_due:${lead.id}:${lead.callbackAt?.getTime() ?? 0}` },
    );
  }
  return due.length;
}

/**
 * A lead that has sat untouched past the first-response window.
 *
 * Speed of the first call is the single biggest lever on whether an enquiry
 * converts, and it is exactly what nobody notices slipping on a busy day.
 */
export async function firstResponseSweep(): Promise<number> {
  return perClinic(firstResponseSweepFor);
}

async function firstResponseSweepFor(clinicId: string): Promise<number> {
  const settings = await getAutomationSettings(db, clinicId);
  if (settings.firstResponseMinutes <= 0) return 0;
  const cutoff = new Date(Date.now() - settings.firstResponseMinutes * 60_000);

  const stale = await db
    .select({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      city: contact.city,
      createdAt: contact.createdAt,
      assignedUserId: contact.assignedUserId,
      assignedRole: contact.assignedRole,
      clinicId: contact.clinicId,
    })
    .from(contact)
    .where(
      and(
        eq(contact.stage, "LEAD"),
        eq(contact.leadStatus, "NEW"),
        lte(contact.createdAt, cutoff),
        isNull(contact.firstResponseEscalatedAt),
        eq(contact.clinicId, clinicId),
        // Only leads that arrived since this feature existed — otherwise the
        // first run escalates every old lead in the database at once.
        sql`${contact.createdAt} >= now() - interval '2 days'`,
      ),
    )
    .limit(BATCH);

  for (const lead of stale) {
    await db.update(contact).set({ firstResponseEscalatedAt: new Date() }).where(eq(contact.id, lead.id));

    await db.insert(task).values({
      contactId: lead.id,
      clinicId: lead.clinicId,
      type: "escalation",
      title: `Not contacted yet: ${lead.name ?? lead.phone ?? "lead"}`,
      notes:
        `This lead arrived ${settings.firstResponseMinutes}+ minutes ago and is still marked New.` +
        (lead.assignedUserId ? "" : " Nobody owns it."),
      assignedUserId: lead.assignedUserId,
      assignedRole: lead.assignedRole,
      dueAt: new Date(),
    });

    // No email. This used to mail the manager for every lead that crossed
    // the line — on a busy ad day, dozens of messages to an inbox nobody
    // reads mid-shift, each about a lead that was already on screen. The
    // lead now sits in the "Waiting too long" section of the call queue,
    // where the person who can call it is already looking. The event still
    // fires, so a flow can act on it.
    await emitDomainEvent(
      db,
      DomainEventType.LEAD_UNWORKED,
      {
        contactId: lead.id,
        name: lead.name ?? "",
        city: lead.city ?? "",
        minutesWaiting: settings.firstResponseMinutes,
        assignedUserId: lead.assignedUserId ?? "",
      },
      { contactId: lead.id, idempotencyKey: `lead_unworked:${lead.id}` },
    );
  }
  return stale.length;
}

// assignmentNotifySweep used to live here: it emailed a telecaller each time
// a lead was routed to them. Removed with the other email alerts — a newly
// routed lead appears at the top of that telecaller's call queue, which is
// where they work from, instead of in an inbox beside it.

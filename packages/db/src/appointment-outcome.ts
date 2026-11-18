import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, inArray, ne } from "drizzle-orm";
import { appointment, contact } from "./schema";
import type * as schema from "./schema";
import { emitDomainEvent } from "./emit-domain-event";
import { DomainEventType } from "./domain-events";
import { applyAppointmentToSitting } from "./enrollment-service";
import { APPOINTMENT_LEAD_STATUS, leadStatusEventType } from "./lead-status";

type Database = NodePgDatabase<typeof schema>;

const OUTCOME_EVENTS: Record<string, DomainEventType> = {
  confirmed: DomainEventType.APPOINTMENT_CONFIRMED,
  completed: DomainEventType.APPOINTMENT_COMPLETED,
  no_show: DomainEventType.APPOINTMENT_NO_SHOW,
  cancelled: DomainEventType.APPOINTMENT_CANCELLED,
};

/** Statuses that still count as the person being expected. */
const LIVE_STATUSES = ["scheduled", "confirmed", "in_consultation"];

export interface AppointmentOutcomeResult {
  /** The stage the contact was moved to, or null if nothing moved. */
  stageChangedTo: string | null;
}

/**
 * Everything that follows from marking an appointment's outcome: the domain
 * event, and the contact's lifecycle stage.
 *
 * This lives in the shared package rather than in a route handler because two
 * apps mark attendance — the clinical staff views in `web`, and the front desk
 * in `automation`. Two copies of "completed means PATIENT, no-show means back
 * to LEAD" is exactly the kind of rule that drifts apart and then nobody can
 * say which app is right.
 *
 * Marking attendance is the only moment the system learns whether a booking
 * became a visit, so it is also the only sensible place for the transition.
 */
export async function applyAppointmentOutcome(
  db: Database,
  params: {
    appointmentId: string;
    contactId: string;
    status: string;
    scheduledAt: Date;
    /** Who marked it — recorded against the therapy day this visit covers. */
    actorId?: string | null;
  },
): Promise<AppointmentOutcomeResult> {
  const { appointmentId, contactId, status, scheduledAt } = params;

  const event = OUTCOME_EVENTS[status];
  if (!event) return { stageChangedTo: null };

  await emitDomainEvent(db, event, { appointmentId, scheduledAt, status }, { contactId });

  // If this visit was one day of a course, the log sheet learns it here.
  // Making a therapist mark the same day twice, once per screen, is how log
  // sheets end up half-filled and adherence stops meaning anything.
  await applyAppointmentToSitting(db, { appointmentId, status, actorId: params.actorId });

  // The lead shows what happened to its appointment — confirmed, missed,
  // cancelled, visited — so Lead work and the call queue never have to be
  // told by hand. Only for someone still on the leads side: a patient's
  // routine therapy visit is not a lead event, and must not fire lead flows.
  const leadStatus = APPOINTMENT_LEAD_STATUS[status];
  const [person] = await db
    .select({ stage: contact.stage, leadStatus: contact.leadStatus })
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);
  if (leadStatus && person && (person.stage === "LEAD" || person.stage === "BOOKED")) {
    const now = new Date();
    await db
      .update(contact)
      .set({ leadStatus, leadStatusAt: now, callbackAt: null, callbackRemindedAt: null, updatedAt: now })
      .where(eq(contact.id, contactId));
    const payload = { contactId, from: person.leadStatus, to: leadStatus, appointmentId, note: "" };
    await emitDomainEvent(db, DomainEventType.LEAD_STATUS_CHANGED, payload, { contactId });
    await emitDomainEvent(db, leadStatusEventType(leadStatus), payload, { contactId });
  }

  if (status === "completed") {
    // Attending does NOT make somebody a patient, and it used to: this set
    // stage to PATIENT the moment a visit was marked completed. A person can
    // come in once, be assessed, and never return — calling them a patient
    // put them on the care team's list and took them off the follow-up list
    // that would have converted them. Buying a sitting plan is the moment
    // there is a course with their name on it, so that is where the promotion
    // lives now (enrollInPlan in ./enrollment-service.ts).
    //
    // They stay BOOKED, which the derived funnel already reads as ATTENDED —
    // "came in, not yet on the clinical side" — so they remain on the leads
    // list and in front of whoever is meant to sell them the course.
    return { stageChangedTo: null };
  }
  if (status === "no_show" || status === "cancelled") {
    // Back to LEAD so nurture picks them up again — but only if this was
    // their last live appointment. Cancelling one of two bookings must not
    // demote someone who is still coming in on the other.
    const otherLive = await db
      .select({ id: appointment.id })
      .from(appointment)
      .where(
        and(
          eq(appointment.contactId, contactId),
          ne(appointment.id, appointmentId),
          inArray(appointment.status, LIVE_STATUSES),
        ),
      )
      .limit(1);

    if (otherLive.length > 0) return { stageChangedTo: null };

    const [moved] = await db
      .update(contact)
      .set({ stage: "LEAD", updatedAt: new Date() })
      .where(and(eq(contact.id, contactId), eq(contact.stage, "BOOKED")))
      .returning();

    if (moved) {
      await emitDomainEvent(
        db,
        DomainEventType.CONTACT_STAGE_CHANGED,
        { contactId, stage: "LEAD" },
        { contactId },
      );
      return { stageChangedTo: "LEAD" };
    }
  }

  return { stageChangedTo: null };
}

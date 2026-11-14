import { db } from "@workspace/db/client";
import { appointment, clinicMember, contact, doctorAvailability, patientRecord, user } from "@workspace/db/schema";
import { and, eq, inArray, isNotNull, sql } from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { ensurePatientRecord } from "@workspace/db/patient-registry";
import {
  advisoryLock,
  openDays,
  slotLockKey,
  slotsForDay,
} from "@workspace/db/availability-service";

// Availability is computed in @workspace/db/availability-service, not here.
// This module had its own copy — weekday templates, capacity, booked counts —
// and the clinic panel had a different one against Cal.com, so the same doctor
// was free on WhatsApp and busy in the panel, or the other way round. One
// implementation answers both now; this file is only the WhatsApp shape of it.

/**
 * The clinic the person on WhatsApp belongs to. Their booking is that clinic's,
 * so the doctors and hours offered are that clinic's too — an OPTM patient
 * sees OPTM's doctors' hours. Undefined for someone with no clinic yet, who
 * keeps seeing every rota.
 */
export async function clinicOfContact(contactId: string): Promise<string | undefined> {
  const [row] = await db.select({ clinicId: contact.clinicId }).from(contact).where(eq(contact.id, contactId)).limit(1);
  return row?.clinicId ?? undefined;
}

export interface AvailableDate {
  date: string; // "2026-08-15"
  label: string; // "Sat, 15 Aug"
}

export interface AvailableSlot {
  slot: string; // "13:00-14:00" — the WhatsApp list option id, round-tripped
  // back into bookSlot() exactly as it was sent.
  label: string; // "1:00 PM – 2:00 PM"
}

export async function getAvailableDates(
  doctorUserId: string,
  opts: { daysAhead?: number; maxDates?: number; clinicId?: string } = {},
): Promise<AvailableDate[]> {
  const days = await openDays(db, {
    doctorUserId,
    daysAhead: opts.daysAhead,
    maxDays: opts.maxDates,
    clinicId: opts.clinicId,
  });
  return days.map(({ date, label }) => ({ date, label }));
}

/**
 * Who should take the next booking when several people share one role.
 *
 * The person with fewer upcoming visits goes first. A tie goes to whoever
 * was assigned a visit least recently, so two nutritionists with the same
 * book split the next bookings evenly. Someone with no open day in the
 * window the patient will actually see is skipped — a free calendar that
 * offers no slot is not a fair half.
 */
export async function pickLeastLoadedClinician(
  role: "nutritionist",
  opts: { daysAhead?: number; maxDates?: number; clinicId?: string } = {},
): Promise<{ id: string; name: string } | null> {
  // Only the clinic's own nutritionists, when the patient has a clinic.
  const people = opts.clinicId
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .innerJoin(clinicMember, eq(clinicMember.userId, user.id))
        .where(
          and(
            eq(user.role, role),
            eq(user.banned, false),
            eq(clinicMember.clinicId, opts.clinicId),
            eq(clinicMember.isActive, true),
          ),
        )
    : await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(and(eq(user.role, role), eq(user.banned, false)));
  if (people.length === 0) return null;

  const loads = await db
    .select({
      doctorUserId: appointment.doctorUserId,
      upcoming: sql<number>`count(*) filter (where ${appointment.status} in ('scheduled', 'confirmed', 'in_consultation') and ${appointment.scheduledAt} >= now())::int`,
      latest: sql<Date | string | null>`max(${appointment.createdAt})`,
    })
    .from(appointment)
    .where(inArray(appointment.doctorUserId, people.map((person) => person.id)))
    .groupBy(appointment.doctorUserId);

  const byId = new Map(loads.map((row) => [row.doctorUserId, row]));
  const ordered = people
    .map((person) => {
      const load = byId.get(person.id);
      const latest = load?.latest;
      const latestAt = latest instanceof Date ? latest.getTime() : latest ? Date.parse(String(latest)) : 0;
      return {
        ...person,
        upcoming: Number(load?.upcoming ?? 0),
        latestAt: Number.isNaN(latestAt) ? 0 : latestAt,
      };
    })
    .sort((a, b) => a.upcoming - b.upcoming || a.latestAt - b.latestAt || a.name.localeCompare(b.name));

  for (const person of ordered) {
    const dates = await getAvailableDates(person.id, opts);
    if (dates.length > 0) return { id: person.id, name: person.name };
  }
  return null;
}

export async function getAvailableTimeSlots(
  doctorUserId: string,
  date: string,
  clinicId?: string,
): Promise<AvailableSlot[]> {
  const { slots } = await slotsForDay(db, { doctorUserId, date, clinicId });
  return slots
    .filter((s) => s.remaining > 0)
    .map((s) => ({ slot: s.id, label: s.label }));
}
export interface BookSlotResult {
  booked: boolean;
  appointmentId?: string;
  reason?: string;
}

// The list shown to the patient a moment earlier is only ever informational
// — this transaction is the sole authority on whether a slot is actually
// still free. An advisory lock keyed on (doctor, date, slot) serializes any
// concurrent booking attempts for that exact slot, so two patients tapping
// the same time range within milliseconds of each other can't both squeeze
// into the last seat: whichever request gets the lock second re-counts,
// finds capacity already used up, and returns `booked: false` instead of
// creating an overbooked row.
export async function bookSlot(params: {
  doctorUserId: string;
  contactId: string;
  date: string;
  slot: string;
  /** "Online (video call)", an address… shown to staff on the appointment. */
  meetingLocation?: string;
  /** virtual bookings get a Meet link after the row exists. */
  channel?: "virtual" | "in_clinic";
}): Promise<BookSlotResult> {
  const ownClinic = await clinicOfContact(params.contactId);
  const result = await db.transaction(async (tx) => {
    await tx.execute(advisoryLock(slotLockKey(params.doctorUserId, params.date, params.slot)));

    // Recomputed inside the lock. The list the patient tapped was built
    // seconds ago and is only ever informational.
    const { slots, closedReason } = await slotsForDay(tx, {
      doctorUserId: params.doctorUserId,
      date: params.date,
      clinicId: ownClinic,
    });
    if (closedReason) return { booked: false as const, reason: closedReason };

    const slot = slots.find((s) => s.id === params.slot);
    if (!slot) return { booked: false as const, reason: "That slot isn't offered anymore" };
    if (slot.remaining <= 0) return { booked: false as const, reason: "That slot just filled up" };

    const start = new Date(slot.startIso);
    const [contactRow] = await tx.select().from(contact).where(eq(contact.id, params.contactId)).limit(1);
    // The clinic panel lists appointments by clinic, so one booked with no
    // clinic was invisible to the staff who have to take it. Someone who
    // arrived through a campaign has no clinic yet: they belong to the one
    // whose calendar they just booked into.
    let clinicId = contactRow?.clinicId ?? null;
    if (!clinicId) {
      const [hours] = await tx
        .select({ clinicId: doctorAvailability.clinicId })
        .from(doctorAvailability)
        .where(and(eq(doctorAvailability.doctorUserId, params.doctorUserId), isNotNull(doctorAvailability.clinicId)))
        .limit(1);
      clinicId = hours?.clinicId ?? null;
      if (clinicId && contactRow) {
        await tx.update(contact).set({ clinicId, updatedAt: new Date() }).where(eq(contact.id, contactRow.id));
      }
    }

    const [row] = await tx
      .insert(appointment)
      .values({
        clinicId,
        contactId: params.contactId,
        doctorUserId: params.doctorUserId,
        type: "consultation",
        scheduledAt: start,
        status: "scheduled",
        channel: params.channel ?? null,
        meetingLocation: params.meetingLocation ?? null,
      })
      .returning();
    if (!row) throw new Error("Failed to create appointment");

    await emitDomainEvent(
      tx,
      DomainEventType.APPOINTMENT_CREATED,
      { contactId: params.contactId, appointmentId: row.id, scheduledAt: start.toISOString() },
      { contactId: params.contactId },
    );

    // A booking moves them to BOOKED, not PATIENT — booking and attending
    // are different events. This is also what takes them out of nurture:
    // every nudge flow checks stage == "LEAD", so no further Day-N message
    // goes out while an appointment stands. If they no-show, the appointment
    // route puts them back to LEAD and nurture resumes.
    // Someone from a campaign list (AUDIENCE) who books is now a real booking too.
    if (contactRow && (contactRow.stage === "LEAD" || contactRow.stage === "AUDIENCE")) {
      await tx.update(contact).set({ stage: "BOOKED", leadStatus: "APPOINTMENT_BOOKED", leadStatusAt: new Date(), updatedAt: new Date() }).where(eq(contact.id, params.contactId));
      await emitDomainEvent(
        tx,
        DomainEventType.CONTACT_STAGE_CHANGED,
        { contactId: params.contactId, stage: "BOOKED" },
        { contactId: params.contactId },
      );
    }

    if (contactRow?.userId) {
      const [patientRow] = await tx.select().from(patientRecord).where(eq(patientRecord.userId, contactRow.userId)).limit(1);
      if (patientRow && !patientRow.onboardedAt) {
        const now = new Date();
        await tx.update(patientRecord).set({ onboardedAt: now, updatedAt: now }).where(eq(patientRecord.id, patientRow.id));
        await emitDomainEvent(
          tx,
          DomainEventType.PATIENT_ONBOARDED,
          { contactId: params.contactId, patientId: patientRow.id, onboardedAt: now.toISOString() },
          { contactId: params.contactId, idempotencyKey: `patient_onboarded:${patientRow.id}` },
        );
      }
    }

    return { booked: true, appointmentId: row.id };
  });

  // A booked person is somebody notes, reports and therapy days will be filed
  // against, and all of that hangs off a chart. Outside the transaction on
  // purpose: it holds an advisory lock on the slot, and the chart is not part
  // of what that lock protects.
  if (result.booked) await ensurePatientRecord(db, params.contactId);

  return result;
}

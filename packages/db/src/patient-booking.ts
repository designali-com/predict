import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { appointment, clinic, doctorAvailability } from "./schema";
import type * as schema from "./schema";
import { advisoryLock, slotLockKey, slotsForDay } from "./availability-service";

type Db = NodePgDatabase<typeof schema>;

/**
 * Booking from the patient app, against the doctors' own availability.
 *
 * The patient app still asked Cal.com for its times after the clinic panel and
 * the WhatsApp flow had moved to doctor_availability — so a patient saw
 * Cal.com's default Mon–Fri 9–5 while the doctor had set Mon–Sat 10–6, and
 * could not book a Saturday the doctor was working.
 *
 * A patient does not pick a doctor here. A time is offered if any doctor who
 * works at their clinic has room then, and booking it gives it to the first of
 * them who still does — checked again under the same lock the clinic uses, so
 * the desk and a patient cannot both take one doctor's last place.
 */

/**
 * Where an in-clinic visit happens, as one line: "F-38, South Extension I, New Delhi".
 *
 * From the clinic's own record — the patient's clinic, or the only one there
 * is — so the address shown before booking and the one saved on the visit are
 * the same. CAL_CLINIC_ADDRESS is the fallback for a clinic with none filled in.
 */
export async function clinicAddressFor(db: Db, clinicId: string | null): Promise<string | null> {
  const rows = await db
    .select({ id: clinic.id, a1: clinic.addressLine1, a2: clinic.addressLine2, city: clinic.city })
    .from(clinic);
  const row = (clinicId ? rows.find((r) => r.id === clinicId) : undefined) ?? (rows.length === 1 ? rows[0] : undefined);
  const line = row ? [row.a1, row.a2, row.city].filter((p) => p && p.trim()).join(", ") : "";
  return line || process.env.CAL_CLINIC_ADDRESS || null;
}

/** Doctors with a working pattern at this clinic (or at any, for a contact not yet placed). */
export async function bookableDoctors(db: Db, clinicId: string | null): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: doctorAvailability.doctorUserId })
    .from(doctorAvailability)
    .where(
      and(
        eq(doctorAvailability.isActive, true),
        clinicId ? or(eq(doctorAvailability.clinicId, clinicId), isNull(doctorAvailability.clinicId)) : undefined,
      ),
    );
  return rows.map((r) => r.id).sort();
}

export interface PatientSlot {
  /** The instant, which is what the booking sends back. */
  startIso: string;
  /** "10:00 AM – 10:30 AM". */
  label: string;
  /** How many doctors could take it. */
  doctors: number;
}

/** Every time on this date at least one of these doctors has room, earliest first. */
export async function openSlotsAnyDoctor(
  db: Db,
  params: { date: string; doctorUserIds: string[]; now?: Date; clinicId?: string | null },
): Promise<PatientSlot[]> {
  const byStart = new Map<string, PatientSlot>();
  for (const doctorUserId of params.doctorUserIds) {
    // The patient's clinic's hours only: a doctor at two clinics is offered
    // where the patient goes.
    const day = await slotsForDay(db, { doctorUserId, date: params.date, now: params.now, clinicId: params.clinicId ?? undefined });
    for (const s of day.slots) {
      if (s.remaining <= 0) continue;
      const seen = byStart.get(s.startIso);
      if (seen) seen.doctors += 1;
      else byStart.set(s.startIso, { startIso: s.startIso, label: s.label, doctors: 1 });
    }
  }
  return [...byStart.values()].sort((a, b) => a.startIso.localeCompare(b.startIso));
}

/**
 * The clinic calendar day an instant falls on. The clinic's offset is a fixed
 * +05:30 (no daylight saving — see availability-service), so shifting by it
 * and reading the UTC date is exact.
 */
export function clinicDateOf(at: Date): string {
  return new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export type BookingOutcome =
  | { row: typeof appointment.$inferSelect }
  | { error: string };

/**
 * Book this time with the first doctor who still has room, or say why not.
 *
 * Each doctor is tried under their own slot lock, and the slot re-read inside
 * it — the list the patient saw is informational, this is the authority.
 */
export async function bookWithAnyDoctor(
  db: Db,
  params: {
    contactId: string;
    start: Date;
    channel: "virtual" | "in_clinic";
    doctorUserIds: string[];
    meetingLocation: string | null;
    /** The clinic the patient belongs to. Stamped on the visit so the clinic list can see it. */
    clinicId?: string | null;
  },
): Promise<BookingOutcome> {
  const date = clinicDateOf(params.start);
  const startIso = params.start.toISOString();

  // The clinic list hides a visit with no clinic. A patient already placed
  // books into their clinic; otherwise the visit belongs to the clinic whose
  // hours were offered.
  let clinicId = params.clinicId ?? null;
  if (!clinicId && params.doctorUserIds.length) {
    const [hours] = await db
      .select({ clinicId: doctorAvailability.clinicId })
      .from(doctorAvailability)
      .where(
        and(
          inArray(doctorAvailability.doctorUserId, params.doctorUserIds),
          isNotNull(doctorAvailability.clinicId),
        ),
      )
      .limit(1);
    clinicId = hours?.clinicId ?? null;
  }

  for (const doctorUserId of params.doctorUserIds) {
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(advisoryLock(slotLockKey(doctorUserId, date, startIso)));
      const { slots, closedReason } = await slotsForDay(tx, { doctorUserId, date, clinicId: clinicId ?? undefined });
      if (closedReason) return null;
      const slot = slots.find((s) => s.startIso === startIso);
      if (!slot || slot.remaining <= 0) return null;

      const [row] = await tx
        .insert(appointment)
        .values({
          clinicId,
          contactId: params.contactId,
          doctorUserId,
          type: "consultation",
          scheduledAt: params.start,
          status: "scheduled",
          channel: params.channel,
          meetingLocation: params.meetingLocation,
        })
        .returning();
      return row ?? null;
    });
    if (outcome) return { row: outcome };
  }

  return { error: "That time has just been taken. Please pick another." };
}

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import {
  contact,
  planEnrollment,
  planSitting,
  therapist,
  therapyBooking,
  therapyClosedDay,
  therapySchedule,
} from "./schema";
import type * as schema from "./schema";
import { EnrollmentStatus } from "./treatment-plan";

type Database = NodePgDatabase<typeof schema>;

/**
 * The therapy calendar: hours, not doctors.
 *
 * An hour holds one patient per working therapist, and each booking names the
 * therapist (picked by the desk, or the first one free). A clinic with no
 * therapists listed falls back to the schedule's capacity. A booking reserves
 * a place in an hour; it is not the sitting.
 * The sitting is written when the patient comes (logSittingVisit), so a
 * no-show or a closed day never moves anybody's course along.
 *
 * Times are clinic time (Asia/Kolkata, a fixed +05:30). starts_at is stored as
 * UTC wall clock like every timestamp in this schema.
 */

export const BookingStatus = {
  BOOKED: "booked",
  ATTENDED: "attended",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];
export const isBookingStatus = (v: unknown): v is BookingStatus =>
  typeof v === "string" && (Object.values(BookingStatus) as string[]).includes(v);

/** Bookings that hold a place in the hour. */
const HOLDS_PLACE = [BookingStatus.BOOKED, BookingStatus.ATTENDED];

const IST_MS = 330 * 60 * 1000;

/** The UTC instant of an hour on a clinic day. */
export function slotStart(day: string, hour: number): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, hour, 0, 0) - IST_MS);
}

/** Clinic day (YYYY-MM-DD) and hour of an instant. */
export function clinicDayHour(at: Date): { day: string; hour: number } {
  const local = new Date(at.getTime() + IST_MS);
  return { day: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export interface TherapyScheduleSettings {
  openHour: number;
  lastHour: number;
  capacity: number;
  /** 0 = Sunday … 6 = Saturday. */
  closedWeekdays: number[];
}

const DEFAULTS: TherapyScheduleSettings = { openHour: 10, lastHour: 18, capacity: 3, closedWeekdays: [0] };

export async function scheduleFor(db: Database, clinicId: string): Promise<TherapyScheduleSettings> {
  const [row] = await db.select().from(therapySchedule).where(eq(therapySchedule.clinicId, clinicId)).limit(1);
  if (!row) return DEFAULTS;
  return {
    openHour: row.openHour,
    lastHour: row.lastHour,
    capacity: row.capacity,
    closedWeekdays: row.closedWeekdays
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
  };
}

export async function saveSchedule(db: Database, clinicId: string, input: Partial<TherapyScheduleSettings>) {
  const cur = await scheduleFor(db, clinicId);
  const hour = (v: unknown, fallback: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 23 ? (v as number) : fallback);
  const next: TherapyScheduleSettings = {
    openHour: hour(input.openHour, cur.openHour),
    lastHour: hour(input.lastHour, cur.lastHour),
    capacity: Number.isInteger(input.capacity) && input.capacity! >= 1 && input.capacity! <= 50 ? input.capacity! : cur.capacity,
    closedWeekdays: Array.isArray(input.closedWeekdays)
      ? [...new Set(input.closedWeekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))]
      : cur.closedWeekdays,
  };
  if (next.lastHour < next.openHour) throw new Error("The last hour cannot be before the first.");
  const values = {
    clinicId,
    openHour: next.openHour,
    lastHour: next.lastHour,
    capacity: next.capacity,
    closedWeekdays: next.closedWeekdays.sort().join(","),
    updatedAt: new Date(),
  };
  await db.insert(therapySchedule).values(values).onConflictDoUpdate({ target: therapySchedule.clinicId, set: values });
  return next;
}

export async function closedDays(db: Database, clinicId: string, from: string, to: string) {
  return db
    .select()
    .from(therapyClosedDay)
    .where(and(eq(therapyClosedDay.clinicId, clinicId), gte(therapyClosedDay.day, from), lt(therapyClosedDay.day, to)))
    .orderBy(asc(therapyClosedDay.day));
}

/** A festival or one-off holiday. Existing bookings on it are left for the desk to move. */
export async function closeDay(db: Database, clinicId: string, day: string, reason: string | null) {
  if (!isDay(day)) throw new Error("Pick a date.");
  await db
    .insert(therapyClosedDay)
    .values({ clinicId, day, reason: reason?.trim() || null })
    .onConflictDoUpdate({ target: [therapyClosedDay.clinicId, therapyClosedDay.day], set: { reason: reason?.trim() || null } });
}

export async function reopenDay(db: Database, clinicId: string, day: string) {
  await db.delete(therapyClosedDay).where(and(eq(therapyClosedDay.clinicId, clinicId), eq(therapyClosedDay.day, day)));
}

export interface TherapistRow {
  id: string;
  name: string;
  gender: string | null;
}

/** The clinic's working therapists, in the order the desk lists them. */
export async function therapistsFor(db: Database, clinicId: string): Promise<TherapistRow[]> {
  return db
    .select({ id: therapist.id, name: therapist.name, gender: therapist.gender })
    .from(therapist)
    .where(and(eq(therapist.clinicId, clinicId), eq(therapist.active, true)))
    .orderBy(asc(therapist.sortOrder), asc(therapist.name));
}

/**
 * Places in an hour: one per working therapist. A clinic that has not listed
 * its therapists keeps the number set in the schedule.
 */
function placesPerHour(settings: TherapyScheduleSettings, therapists: TherapistRow[]): number {
  return therapists.length > 0 ? therapists.length : settings.capacity;
}

export interface SlotCell {
  hour: number;
  booked: number;
  free: number;
  /** Therapists already taken in this hour. */
  busyTherapistIds: string[];
}
export interface DayColumn {
  day: string;
  closed: boolean;
  reason: string | null;
  slots: SlotCell[];
}

/** Places taken per hour, for a run of days — the grid the desk reads off the phone. */
export async function slotGrid(db: Database, clinicId: string, from: string, days = 7) {
  const [settings, therapists] = await Promise.all([scheduleFor(db, clinicId), therapistsFor(db, clinicId)]);
  const capacity = placesPerHour(settings, therapists);
  const to = addDays(from, days);
  const [holidays, rows] = await Promise.all([
    closedDays(db, clinicId, from, to),
    db
      .select({ startsAt: therapyBooking.startsAt, therapistId: therapyBooking.therapistId })
      .from(therapyBooking)
      .where(
        and(
          eq(therapyBooking.clinicId, clinicId),
          gte(therapyBooking.startsAt, slotStart(from, 0)),
          lt(therapyBooking.startsAt, slotStart(to, 0)),
          inArray(therapyBooking.status, HOLDS_PLACE),
        ),
      ),
  ]);
  const taken = new Map<string, number>();
  const busy = new Map<string, string[]>();
  for (const r of rows) {
    const { day, hour } = clinicDayHour(r.startsAt);
    const key = `${day}|${hour}`;
    taken.set(key, (taken.get(key) ?? 0) + 1);
    if (r.therapistId) busy.set(key, [...(busy.get(key) ?? []), r.therapistId]);
  }
  const columns: DayColumn[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    const holiday = holidays.find((h) => h.day === day);
    const closed = Boolean(holiday) || settings.closedWeekdays.includes(weekday(day));
    const slots: SlotCell[] = [];
    for (let hour = settings.openHour; hour <= settings.lastHour; hour++) {
      const booked = taken.get(`${day}|${hour}`) ?? 0;
      slots.push({
        hour,
        booked,
        free: closed ? 0 : Math.max(0, capacity - booked),
        busyTherapistIds: busy.get(`${day}|${hour}`) ?? [],
      });
    }
    columns.push({ day, closed, reason: holiday?.reason ?? (closed ? "Closed" : null), slots });
  }
  // capacity reported as the places an hour really has, so every screen that
  // reads settings.capacity says the same thing as the grid.
  return { settings: { ...settings, capacity }, therapists, columns };
}

export interface DayBooking {
  id: string;
  hour: number;
  status: string;
  note: string | null;
  contactId: string;
  name: string | null;
  phone: string | null;
  enrollmentId: string | null;
  planName: string | null;
  sittingsSold: number | null;
  sittingsDone: number;
  sittingId: string | null;
  therapistId: string | null;
  therapistName: string | null;
}

/** Everybody booked on one clinic day, hour by hour, with where their course stands. */
export async function bookingsOn(db: Database, clinicId: string, day: string): Promise<DayBooking[]> {
  const rows = await db
    .select({
      id: therapyBooking.id,
      startsAt: therapyBooking.startsAt,
      status: therapyBooking.status,
      note: therapyBooking.note,
      contactId: therapyBooking.contactId,
      name: contact.name,
      phone: contact.phone,
      enrollmentId: therapyBooking.enrollmentId,
      planName: planEnrollment.planName,
      sittingsSold: planEnrollment.sittings,
      sittingId: therapyBooking.sittingId,
      therapistId: therapyBooking.therapistId,
      therapistName: therapist.name,
    })
    .from(therapyBooking)
    .innerJoin(contact, eq(contact.id, therapyBooking.contactId))
    .leftJoin(planEnrollment, eq(planEnrollment.id, therapyBooking.enrollmentId))
    .leftJoin(therapist, eq(therapist.id, therapyBooking.therapistId))
    .where(
      and(
        eq(therapyBooking.clinicId, clinicId),
        gte(therapyBooking.startsAt, slotStart(day, 0)),
        lt(therapyBooking.startsAt, slotStart(addDays(day, 1), 0)),
      ),
    )
    .orderBy(asc(therapyBooking.startsAt), asc(therapyBooking.createdAt));

  const ids = [...new Set(rows.map((r) => r.enrollmentId).filter((x): x is string => Boolean(x)))];
  const done = ids.length
    ? await db
        .select({ enrollmentId: planSitting.enrollmentId, n: sql<number>`count(*)::int` })
        .from(planSitting)
        .where(and(inArray(planSitting.enrollmentId, ids), eq(planSitting.status, "done")))
        .groupBy(planSitting.enrollmentId)
    : [];
  const doneBy = new Map(done.map((d) => [d.enrollmentId, d.n]));
  return rows.map((r) => ({
    id: r.id,
    hour: clinicDayHour(r.startsAt).hour,
    status: r.status,
    note: r.note,
    contactId: r.contactId,
    name: r.name,
    phone: r.phone,
    enrollmentId: r.enrollmentId,
    planName: r.planName,
    sittingsSold: r.sittingsSold,
    sittingsDone: r.enrollmentId ? (doneBy.get(r.enrollmentId) ?? 0) : 0,
    sittingId: r.sittingId,
    therapistId: r.therapistId,
    therapistName: r.therapistName,
  }));
}

/** The course a booking is for when none is named: the patient's running one. */
async function runningCourse(db: Database, contactId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: planEnrollment.id })
    .from(planEnrollment)
    .where(and(eq(planEnrollment.contactId, contactId), eq(planEnrollment.status, EnrollmentStatus.ACTIVE)))
    .orderBy(sql`${planEnrollment.activatedAt} desc nulls last`)
    .limit(1);
  return row?.id ?? null;
}

export interface BookSlotParams {
  clinicId: string;
  contactId: string;
  day: string;
  hour: number;
  enrollmentId?: string | null;
  /** Who gives it. Left out, the first therapist free that hour is given. */
  therapistId?: string | null;
  note?: string | null;
  actorId?: string | null;
}

/** Put a patient in an hour with a therapist, if one is free and the clinic is open. */
export async function bookSlot(db: Database, params: BookSlotParams) {
  if (!isDay(params.day)) throw new Error("Pick a date.");
  const [settings, therapists] = await Promise.all([scheduleFor(db, params.clinicId), therapistsFor(db, params.clinicId)]);
  const capacity = placesPerHour(settings, therapists);
  if (params.therapistId && !therapists.some((t) => t.id === params.therapistId)) {
    throw new Error("That therapist is not on this clinic's list.");
  }
  if (!Number.isInteger(params.hour) || params.hour < settings.openHour || params.hour > settings.lastHour) {
    throw new Error(`Therapy is booked between ${settings.openHour}:00 and ${settings.lastHour}:00.`);
  }
  if (settings.closedWeekdays.includes(weekday(params.day))) throw new Error("The clinic gives no therapy that day.");
  const [holiday] = await closedDays(db, params.clinicId, params.day, addDays(params.day, 1));
  if (holiday) throw new Error(`Closed that day${holiday.reason ? ` — ${holiday.reason}` : ""}.`);
  const start = slotStart(params.day, params.hour);
  // Today's earlier hours stay open: the desk often enters a patient after
  // they have come in. An earlier day is over.
  if (params.day < clinicDayHour(new Date()).day) throw new Error("That day has already gone.");

  const [person] = await db.select({ id: contact.id }).from(contact).where(eq(contact.id, params.contactId)).limit(1);
  if (!person) throw new Error("No such patient.");
  let enrollmentId = params.enrollmentId ?? null;
  if (enrollmentId) {
    const [own] = await db
      .select({ id: planEnrollment.id })
      .from(planEnrollment)
      .where(and(eq(planEnrollment.id, enrollmentId), eq(planEnrollment.contactId, params.contactId)))
      .limit(1);
    if (!own) throw new Error("That course is not this patient's.");
  } else {
    enrollmentId = await runningCourse(db, params.contactId);
  }

  return db.transaction(async (tx) => {
    const t = tx as unknown as Database;
    // One hour at a time: two desks taking the last place cannot both get it.
    await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`therapy:${params.clinicId}:${start.toISOString()}`}))`);
    const holders = await t
      .select({ contactId: therapyBooking.contactId, therapistId: therapyBooking.therapistId })
      .from(therapyBooking)
      .where(
        and(
          eq(therapyBooking.clinicId, params.clinicId),
          eq(therapyBooking.startsAt, start),
          inArray(therapyBooking.status, HOLDS_PLACE),
        ),
      );
    if (holders.some((h) => h.contactId === params.contactId)) throw new Error("Already booked in that hour.");
    if (holders.length >= capacity) throw new Error("That hour is full — pick another.");
    // A therapist treats one patient an hour.
    let therapistId: string | null = params.therapistId ?? null;
    if (therapists.length > 0) {
      const busy = new Set(holders.map((h) => h.therapistId).filter(Boolean));
      if (therapistId && busy.has(therapistId)) {
        const who = therapists.find((x) => x.id === therapistId)?.name ?? "That therapist";
        throw new Error(`${who} already has a patient in that hour — pick another therapist.`);
      }
      therapistId ??= therapists.find((x) => !busy.has(x.id))?.id ?? null;
      if (!therapistId) throw new Error("Every therapist is taken in that hour — pick another.");
    }
    const [row] = await t
      .insert(therapyBooking)
      .values({
        clinicId: params.clinicId,
        contactId: params.contactId,
        enrollmentId,
        therapistId,
        startsAt: start,
        status: BookingStatus.BOOKED,
        note: params.note?.trim() || null,
        createdByUserId: params.actorId ?? null,
      })
      .returning();
    return row!;
  });
}

/** Cancel, mark a no-show, or put a booking back. A sitting is never undone here. */
export async function setBookingStatus(db: Database, clinicId: string, bookingId: string, status: string) {
  if (!isBookingStatus(status) || status === BookingStatus.ATTENDED) {
    throw new Error("A booking is attended by logging the sitting.");
  }
  const [row] = await db
    .update(therapyBooking)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(therapyBooking.id, bookingId),
        eq(therapyBooking.clinicId, clinicId),
        ne(therapyBooking.status, BookingStatus.ATTENDED),
      ),
    )
    .returning();
  if (!row) throw new Error("That booking cannot be changed — it may already be attended.");
  return row;
}

/**
 * Move a booking to another day or hour: the new hour is booked with every
 * check a booking gets (open, not full, therapist free), and the old one is
 * cancelled with a note of where it went — both or neither. Their course stays.
 */
export async function rescheduleBooking(
  db: Database,
  params: { clinicId: string; bookingId: string; day: string; hour: number; therapistId?: string | null; actorId?: string | null },
) {
  const [old] = await db
    .select()
    .from(therapyBooking)
    .where(and(eq(therapyBooking.id, params.bookingId), eq(therapyBooking.clinicId, params.clinicId)))
    .limit(1);
  if (!old) throw new Error("That booking no longer exists.");
  if (old.status === BookingStatus.ATTENDED) throw new Error("The sitting is already logged — book a new hour instead.");
  const from = clinicDayHour(old.startsAt);
  if (from.day === params.day && from.hour === params.hour) throw new Error("That is the same hour — pick another.");

  return db.transaction(async (tx) => {
    const t = tx as unknown as Database;
    const moved = await bookSlot(t, {
      clinicId: params.clinicId,
      contactId: old.contactId,
      day: params.day,
      hour: params.hour,
      enrollmentId: old.enrollmentId,
      therapistId: params.therapistId ?? null,
      note: [old.note, `Moved from ${from.day} ${from.hour}:00`].filter(Boolean).join(" · "),
      actorId: params.actorId,
    });
    // A booking still held is let go; a no-show stays one — it happened.
    await t
      .update(therapyBooking)
      .set({
        status: old.status === BookingStatus.BOOKED ? BookingStatus.CANCELLED : old.status,
        note: [old.note, `Rescheduled to ${params.day} ${params.hour}:00`].filter(Boolean).join(" · "),
        updatedAt: new Date(),
      })
      .where(eq(therapyBooking.id, old.id));
    return moved;
  });
}

/** One patient's upcoming hours at this clinic, for their record. */
export async function upcomingBookings(db: Database, clinicId: string, contactId: string) {
  const rows = await db
    .select()
    .from(therapyBooking)
    .where(
      and(
        eq(therapyBooking.clinicId, clinicId),
        eq(therapyBooking.contactId, contactId),
        eq(therapyBooking.status, BookingStatus.BOOKED),
        gte(therapyBooking.startsAt, new Date(Date.now() - 60 * 60 * 1000)),
      ),
    )
    .orderBy(asc(therapyBooking.startsAt));
  return rows.map((r) => ({ ...r, ...clinicDayHour(r.startsAt) }));
}

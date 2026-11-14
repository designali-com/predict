import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { appointment, doctorAvailability, doctorTimeOff, user } from "./schema";
import { appointmentInClinic } from "./appointment-scope";
import type * as schema from "./schema";

type Database = NodePgDatabase<typeof schema>;

/**
 * When a doctor is free — computed from this clinic's own data.
 *
 * It used to come from Cal.com: one event type, no hosts, no schedule, so it
 * answered with Cal.com's default Mon–Fri 9–5 for every doctor alike. The
 * doctor picker on the booking form changed nothing, and two doctors could be
 * put in the same 10:00 with nothing to stop it.
 *
 * Three inputs, all ours:
 *
 *   doctor_availability — the weekly working pattern, per weekday
 *   doctor_time_off     — dated exceptions, so leave does not mean deleting
 *                         Tuesdays and putting them back afterwards
 *   appointment         — what is already booked, against the slot's capacity
 *
 * A virtual booking creates its Meet link afterwards, on the clinic's Google
 * Calendar. This function is not asked for that.
 *
 * This lives in the shared package because three callers need the same answer:
 * the clinic booking form, the patient app, and the WhatsApp booking flow. Two
 * implementations of "is 10:00 free" is how a slot gets sold twice.
 */

/**
 * The clinic runs on one wall clock. Asia/Kolkata is UTC+5:30 and has no
 * daylight saving, so the offset is a constant rather than a lookup.
 *
 * Everything below is wall-clock time in that zone, converted to a real
 * instant only at the boundary. Using the server's own timezone — which the
 * first version of this did — puts a clinic morning in the previous UTC day
 * for half the world's deployments, and offers a slot whose weekday template
 * was never the one checked.
 */
export const CLINIC_UTC_OFFSET = "+05:30";

/** A wall-clock date and time in the clinic's zone, as a real instant. */
export function clinicInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${CLINIC_UTC_OFFSET}`);
}

/** YYYY-MM-DD for a date offset from today, in the clinic's zone. */
export function clinicDate(daysFromToday = 0, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 5.5 * 60 * 60 * 1000 + daysFromToday * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD in the clinic's zone. */
export function clinicWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "13:00" → "1:00 PM", for anything a patient reads. */
export function timeLabel(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr ?? "00"} ${period}`;
}

export interface Slot {
  /** "09:00" — clinic wall clock. */
  start: string;
  /** "09:30". */
  end: string;
  /** "09:00-09:30" — the id the WhatsApp list and the booking form round-trip. */
  id: string;
  /** "9:00 AM – 9:30 AM". */
  label: string;
  /** The real instant, which is what appointment.scheduledAt stores. */
  startIso: string;
  capacity: number;
  booked: number;
  /** Free places left. Zero means taken. */
  remaining: number;
}

export interface DaySlots {
  date: string;
  slots: Slot[];
  /** Set when the doctor is not working that day at all. */
  closedReason: string | null;
}

/**
 * Every slot the doctor's pattern produces for one day, with what is left.
 *
 * Full slots are returned rather than filtered out, carrying `remaining: 0`, so
 * a caller can show a busy morning as busy instead of as an empty day — "no
 * times" and "all taken" are different things to the person at the desk, and
 * only one of them is worth trying another doctor for.
 *
 * A time that has already started is a different case again, and it IS dropped.
 * A full slot can be freed by a cancellation; a slot at 9am cannot be freed at
 * 3pm. Showing it greyed out would only invite the question "why not?", and
 * showing it live would let the desk book a visit into this morning.
 */
export async function slotsForDay(
  db: Database,
  /** `now` is injectable so this is testable without waiting for a clock. */
  params: {
    doctorUserId: string;
    date: string;
    now?: Date;
    /**
     * The clinic asking. A doctor who sits at two clinics has a rota at each,
     * and this clinic's desk must offer only the hours worked HERE. The patient
     * app and the WhatsApp flow pass the patient's own clinic; left out only
     * for someone with no clinic yet, who sees every rota.
     */
    clinicId?: string;
  },
): Promise<DaySlots> {
  const { doctorUserId, date, clinicId } = params;
  const now = params.now ?? new Date();

  const templates = await db
    .select()
    .from(doctorAvailability)
    .where(
      and(
        eq(doctorAvailability.doctorUserId, doctorUserId),
        eq(doctorAvailability.dayOfWeek, clinicWeekday(date)),
        eq(doctorAvailability.isActive, true),
        clinicId ? eq(doctorAvailability.clinicId, clinicId) : undefined,
      ),
    )
    .orderBy(asc(doctorAvailability.startTime));

  if (!templates.length) {
    return { date, slots: [], closedReason: "Not a working day for this doctor" };
  }

  // Leave overlapping this date. A whole-day entry closes the day outright; a
  // half day only removes the hours it covers.
  const leave = await db
    .select()
    .from(doctorTimeOff)
    .where(
      and(
        eq(doctorTimeOff.doctorUserId, doctorUserId),
        lte(doctorTimeOff.startDate, date),
        gte(doctorTimeOff.endDate, date),
        clinicId ? leaveAppliesTo(clinicId) : undefined,
      ),
    );

  // One query for the whole day rather than one per slot — a working day is
  // sixteen slots and this used to be sixteen round trips.
  //
  // Not narrowed to the clinic, on purpose. One doctor cannot be in two rooms
  // at 10:00, so a visit booked at the other branch still holds the time; and
  // only a count comes back, never whose visit it is.
  const dayStart = clinicInstant(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const booked = await db
    .select({ scheduledAt: appointment.scheduledAt })
    .from(appointment)
    .where(
      and(
        eq(appointment.doctorUserId, doctorUserId),
        gte(appointment.scheduledAt, dayStart),
        lt(appointment.scheduledAt, dayEnd),
        // A cancelled visit frees its slot. A no-show does not — that time was
        // held and lost, and re-selling it retrospectively would misreport the
        // day.
        ne(appointment.status, "cancelled"),
      ),
    );

  return computeDaySlots({ date, templates, leave, booked, now });
}

/**
 * Leave that counts at this clinic: its own entries, plus unstamped ones from
 * before clinics existed, which meant "away" everywhere.
 */
function leaveAppliesTo(clinicId: string) {
  return or(eq(doctorTimeOff.clinicId, clinicId), isNull(doctorTimeOff.clinicId));
}

type Template = typeof doctorAvailability.$inferSelect;
type Leave = typeof doctorTimeOff.$inferSelect;

/**
 * The slots one doctor has on one date, from rows already loaded.
 *
 * The arithmetic half of slotsForDay, split out so a whole month can be worked
 * out from three queries (openDatesInRange) by exactly the same rules as a
 * single day — rather than a second copy of them that drifts.
 *
 * `templates` must already be this date's weekday; `leave` and `booked` may
 * hold other dates, which are ignored.
 */
export function computeDaySlots(params: {
  date: string;
  templates: Template[];
  leave: Leave[];
  booked: { scheduledAt: Date | string }[];
  now: Date;
}): DaySlots {
  const { date, now } = params;
  const templates = [...params.templates].sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (!templates.length) {
    return { date, slots: [], closedReason: "Not a working day for this doctor" };
  }

  const leave = params.leave.filter((l) => l.startDate <= date && l.endDate >= date);
  const wholeDayOff = leave.find((l) => !l.startTime || !l.endTime);
  if (wholeDayOff) {
    return { date, slots: [], closedReason: wholeDayOff.reason ?? "On leave" };
  }

  const partial = leave.map((l) => ({
    from: toMinutes(l.startTime!),
    to: toMinutes(l.endTime!),
  }));

  const bookedAt = new Map<number, number>();
  for (const row of params.booked) {
    const at = new Date(row.scheduledAt).getTime();
    bookedAt.set(at, (bookedAt.get(at) ?? 0) + 1);
  }

  const slots: Slot[] = [];
  for (const template of templates) {
    const from = toMinutes(template.startTime);
    const to = toMinutes(template.endTime);
    const step = Math.max(5, template.slotMinutes);

    for (let m = from; m + step <= to; m += step) {
      // A slot that starts inside a half day off does not exist.
      if (partial.some((p) => m < p.to && m + step > p.from)) continue;

      const start = toHHMM(m);
      const end = toHHMM(m + step);
      const startsAt = clinicInstant(date, start);
      const taken = bookedAt.get(startsAt.getTime()) ?? 0;

      slots.push({
        start,
        end,
        id: `${start}-${end}`,
        label: `${timeLabel(start)} – ${timeLabel(end)}`,
        startIso: startsAt.toISOString(),
        capacity: template.capacity,
        booked: taken,
        remaining: Math.max(0, template.capacity - taken),
      });
    }
  }

  // Two windows can overlap if somebody sets them that way; the earlier one
  // wins so the same time is never offered twice.
  const seen = new Set<string>();
  const unique = slots
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));

  // Only today can have times behind it: earlier dates are not selectable and
  // later ones are entirely ahead, so this costs nothing on every other day.
  if (date !== clinicDate(0, now)) {
    return { date, slots: unique, closedReason: null };
  }

  const ahead = unique.filter((s) => new Date(s.startIso).getTime() > now.getTime());

  // The day had times and they have gone. Said as its own sentence, because
  // "not working today" and "you are too late today" send the desk to two
  // different places — another doctor, or tomorrow.
  if (unique.length > 0 && ahead.length === 0) {
    return { date, slots: [], closedReason: "Today's times have all passed — try tomorrow" };
  }

  return { date, slots: ahead, closedReason: null };
}

/**
 * Which dates in a range any of these doctors has an open slot on.
 *
 * For a booking calendar that greys out the days there is nothing to book:
 * three queries for the whole range, then the same per-day rules as
 * slotsForDay. Dates are "YYYY-MM-DD", inclusive.
 */
export async function openDatesInRange(
  db: Database,
  params: { doctorUserIds: string[]; from: string; to: string; now?: Date },
): Promise<string[]> {
  const { doctorUserIds, from, to } = params;
  const now = params.now ?? new Date();
  if (!doctorUserIds.length || from > to) return [];

  const [templates, leave, booked] = await Promise.all([
    db
      .select()
      .from(doctorAvailability)
      .where(and(inArray(doctorAvailability.doctorUserId, doctorUserIds), eq(doctorAvailability.isActive, true))),
    db
      .select()
      .from(doctorTimeOff)
      .where(
        and(
          inArray(doctorTimeOff.doctorUserId, doctorUserIds),
          lte(doctorTimeOff.startDate, to),
          gte(doctorTimeOff.endDate, from),
        ),
      ),
    db
      .select({ doctorUserId: appointment.doctorUserId, scheduledAt: appointment.scheduledAt })
      .from(appointment)
      .where(
        and(
          inArray(appointment.doctorUserId, doctorUserIds),
          gte(appointment.scheduledAt, clinicInstant(from, "00:00")),
          lt(appointment.scheduledAt, new Date(clinicInstant(to, "00:00").getTime() + 86_400_000)),
          ne(appointment.status, "cancelled"),
        ),
      ),
  ]);

  const open: string[] = [];
  for (let date = from; date <= to; date = nextDate(date)) {
    const weekday = clinicWeekday(date);
    const hasRoom = doctorUserIds.some((doctorUserId) => {
      const day = computeDaySlots({
        date,
        templates: templates.filter((t) => t.doctorUserId === doctorUserId && t.dayOfWeek === weekday),
        leave: leave.filter((l) => l.doctorUserId === doctorUserId),
        booked: booked.filter((b) => b.doctorUserId === doctorUserId),
        now,
      });
      return day.slots.some((s) => s.remaining > 0);
    });
    if (hasRoom) open.push(date);
  }
  return open;
}

function nextDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
}

export interface OpenDay {
  date: string;
  label: string;
  open: number;
}

/**
 * The next few days this doctor has room on — for the WhatsApp flow, which
 * offers dates before it offers times.
 *
 * Today is excluded: a slot at 09:00 offered at 16:00 is not a slot.
 */
export async function openDays(
  db: Database,
  params: { doctorUserId: string; daysAhead?: number; maxDays?: number; clinicId?: string },
): Promise<OpenDay[]> {
  const daysAhead = params.daysAhead ?? 14;
  const maxDays = params.maxDays ?? 5;

  const out: OpenDay[] = [];
  for (let i = 1; i <= daysAhead && out.length < maxDays; i++) {
    const date = clinicDate(i);
    const { slots } = await slotsForDay(db, {
      doctorUserId: params.doctorUserId,
      date,
      clinicId: params.clinicId,
    });
    const open = slots.filter((s) => s.remaining > 0).length;
    if (!open) continue;

    const [y, m, d] = date.split("-").map(Number);
    out.push({
      date,
      label: new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-IN", {
        timeZone: "UTC",
        weekday: "short",
        day: "2-digit",
        month: "short",
      }),
      open,
    });
  }
  return out;
}

/**
 * Is this exact slot still bookable?
 *
 * The list a patient saw a moment ago is informational; this is the authority.
 * Call it inside the booking transaction, behind an advisory lock on the slot,
 * or two people tapping the same time a millisecond apart both get it.
 */
export async function slotIsOpen(
  db: Database,
  params: { doctorUserId: string; date: string; slotId: string; clinicId?: string },
): Promise<{ open: boolean; reason?: string; startIso?: string }> {
  const { slots, closedReason } = await slotsForDay(db, {
    doctorUserId: params.doctorUserId,
    date: params.date,
    clinicId: params.clinicId,
  });

  if (closedReason) return { open: false, reason: closedReason };

  const slot = slots.find((s) => s.id === params.slotId);
  if (!slot) return { open: false, reason: "That time is not offered any more" };
  if (slot.remaining <= 0) return { open: false, reason: "That time has just been taken" };

  return { open: true, startIso: slot.startIso };
}

/** The doctor's weekly pattern at one clinic, for the editor on their own profile. */
export async function weeklyPattern(db: Database, doctorUserId: string, clinicId: string) {
  return db
    .select()
    .from(doctorAvailability)
    .where(and(eq(doctorAvailability.doctorUserId, doctorUserId), eq(doctorAvailability.clinicId, clinicId)))
    .orderBy(asc(doctorAvailability.dayOfWeek), asc(doctorAvailability.startTime));
}

export interface WeeklyWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  capacity: number;
  isActive: boolean;
}

/**
 * Replace the doctor's whole weekly pattern.
 *
 * Wholesale rather than row by row: the editor hands back the entire grid, the
 * rows have no identity the UI tracks, and appointments already booked point at
 * a time rather than at a template — so nothing downstream depends on these
 * rows surviving.
 */
export async function saveWeeklyPattern(
  db: Database,
  doctorUserId: string,
  windows: WeeklyWindow[],
  /** The clinic this rota is for — a doctor can sit at more than one. */
  clinicId: string,
): Promise<void> {
  // Without a clinic the delete below would take every clinic's rota for
  // this doctor and put back hours that belong to none of them.
  if (!clinicId) throw new Error("No clinic to save these hours for.");

  for (const w of windows) {
    if (!Number.isInteger(w.dayOfWeek) || w.dayOfWeek < 0 || w.dayOfWeek > 6) {
      throw new Error("Each row needs a weekday.");
    }
    if (toMinutes(w.endTime) <= toMinutes(w.startTime)) {
      throw new Error(`${w.startTime}–${w.endTime} ends before it starts.`);
    }
    if (toMinutes(w.endTime) - toMinutes(w.startTime) < w.slotMinutes) {
      throw new Error(
        `${w.startTime}–${w.endTime} is shorter than one ${w.slotMinutes}-minute appointment.`,
      );
    }
    if (w.capacity < 1) throw new Error("Capacity is at least 1.");
  }

  await db.transaction(async (tx) => {
    // Replace only this clinic's rota: saving Delhi's hours must not wipe the
    // same doctor's Kolkata hours.
    await tx
      .delete(doctorAvailability)
      .where(and(eq(doctorAvailability.doctorUserId, doctorUserId), eq(doctorAvailability.clinicId, clinicId)));
    if (windows.length) {
      await tx
        .insert(doctorAvailability)
        .values(windows.map((w) => ({ ...w, doctorUserId, clinicId })));
    }
  });
}

export async function listTimeOff(db: Database, doctorUserId: string, clinicId: string) {
  return db
    .select()
    .from(doctorTimeOff)
    .where(and(eq(doctorTimeOff.doctorUserId, doctorUserId), leaveAppliesTo(clinicId)))
    .orderBy(asc(doctorTimeOff.startDate));
}

export interface TimeOffInput {
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
  actorId?: string | null;
}

export async function addTimeOff(
  db: Database,
  doctorUserId: string,
  /** The clinic the absence is from — leave at one branch is not leave at both. */
  clinicId: string,
  input: TimeOffInput,
) {
  if (!clinicId) throw new Error("No clinic to record this absence against.");
  if (input.endDate < input.startDate) throw new Error("The last day is before the first.");

  // Both or neither: a half day with only one end is a range nothing can read.
  const half = Boolean(input.startTime) !== Boolean(input.endTime);
  if (half) throw new Error("A part-day absence needs both a from and a to time.");

  const [created] = await db
    .insert(doctorTimeOff)
    .values({
      doctorUserId,
      clinicId,
      startDate: input.startDate,
      endDate: input.endDate,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      reason: input.reason?.trim() || null,
      createdByUserId: input.actorId ?? null,
    })
    .returning();

  // Booked visits inside the absence are not cancelled here — that is a
  // conversation with a patient, not a side effect of ticking a day off. They
  // are counted so whoever set it can go and move them.
  const clash = await db
    .select({ id: appointment.id, scheduledAt: appointment.scheduledAt })
    .from(appointment)
    .where(
      and(
        eq(appointment.doctorUserId, doctorUserId),
        // Only this clinic's visits are the ones its absence clashes with.
        appointmentInClinic(clinicId),
        gte(appointment.scheduledAt, clinicInstant(input.startDate, input.startTime || "00:00")),
        lt(
          appointment.scheduledAt,
          input.endTime
            ? clinicInstant(input.endDate, input.endTime)
            : new Date(clinicInstant(input.endDate, "00:00").getTime() + 86_400_000),
        ),
        ne(appointment.status, "cancelled"),
      ),
    );

  return { timeOff: created!, clashingAppointments: clash };
}

export async function removeTimeOff(
  db: Database,
  id: string,
  doctorUserId: string,
  clinicId: string,
): Promise<void> {
  await db
    .delete(doctorTimeOff)
    .where(
      and(eq(doctorTimeOff.id, id), eq(doctorTimeOff.doctorUserId, doctorUserId), leaveAppliesTo(clinicId)),
    );
}

/** Advisory-lock key for one doctor's slot — see bookSlot in the flow engine. */
export function slotLockKey(doctorUserId: string, date: string, slotId: string): string {
  return `doctor_slot:${doctorUserId}:${date}:${slotId}`;
}

export const advisoryLock = (key: string) => sql`select pg_advisory_xact_lock(hashtext(${key}))`;

// ── The schedule board ─────────────────────────────────────────────────────

export interface BoardDay {
  date: string;
  /** Slots this clinician's pattern produces that day. */
  capacity: number;
  booked: number;
  /** Set when they are not working — "On leave", "Not a working day". */
  closedReason: string | null;
}

export interface BoardRow {
  clinicianId: string;
  name: string;
  role: string | null;
  days: BoardDay[];
  /** Across the whole window. */
  totalCapacity: number;
  totalBooked: number;
  /** booked / capacity, or null for somebody with no hours at all. */
  utilisation: number | null;
  /** True when this person has no working hours configured anywhere. */
  noHoursSet: boolean;
}

/**
 * Who is in, who is free, and who is away — the whole week, everyone at once.
 *
 * This is the screen a front desk needs to answer "can you fit me in on
 * Thursday?" without opening four calendars one at a time. It replaced a staff
 * directory whose only working page was a month of one doctor's booked
 * appointments, and which printed "No appointments — free" on a day the doctor
 * was on leave.
 *
 * Batched deliberately: the obvious version calls slotsForDay per clinician per
 * day, which for six people over a week is forty-two round trips for one
 * screen. Templates, leave and bookings are three queries, and the grid is
 * computed from them.
 */
export async function weekBoard(
  db: Database,
  params: { from: string; days?: number; clinicId?: string },
): Promise<{ dates: string[]; rows: BoardRow[] }> {
  const span = params.days ?? 7;
  const dates = Array.from({ length: span }, (_, i) => {
    const [y, m, d] = params.from.split("-").map(Number);
    const at = new Date(Date.UTC(y!, m! - 1, d! + i));
    return at.toISOString().slice(0, 10);
  });

  const windowStart = clinicInstant(dates[0]!, "00:00");
  const windowEnd = new Date(clinicInstant(dates[dates.length - 1]!, "00:00").getTime() + 86_400_000);

  // A doctor's sitting hours belong to the clinic they sit at, so the board
  // shows this clinic's doctors and this clinic's bookings — never the other
  // branch's rota under this branch's heading.
  const clinicOnly = params.clinicId
    ? and(eq(doctorAvailability.isActive, true), eq(doctorAvailability.clinicId, params.clinicId))
    : eq(doctorAvailability.isActive, true);

  const [templates, leave, booked] = await Promise.all([
    db.select().from(doctorAvailability).where(clinicOnly),
    db
      .select()
      .from(doctorTimeOff)
      .where(
        and(lte(doctorTimeOff.startDate, dates[dates.length - 1]!), gte(doctorTimeOff.endDate, dates[0]!)),
      ),
    db
      .select({ doctorUserId: appointment.doctorUserId, scheduledAt: appointment.scheduledAt })
      .from(appointment)
      .where(
        and(
          gte(appointment.scheduledAt, windowStart),
          lt(appointment.scheduledAt, windowEnd),
          ne(appointment.status, "cancelled"),
          ...(params.clinicId ? [eq(appointment.clinicId, params.clinicId)] : []),
        ),
      ),
  ]);

  // Everyone with a bookable calendar, plus anyone who already has something in
  // the diary — a clinician whose hours were removed still has patients coming.
  const ids = [
    ...new Set([
      ...templates.map((t) => t.doctorUserId),
      ...booked.map((b) => b.doctorUserId).filter((v): v is string => Boolean(v)),
    ]),
  ];
  if (!ids.length) return { dates, rows: [] };

  const people = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(inArray(user.id, ids));

  const rows: BoardRow[] = people
    .map((person) => {
      const mine = templates.filter((t) => t.doctorUserId === person.id);
      const myLeave = leave.filter((l) => l.doctorUserId === person.id);
      const myBookings = booked.filter((b) => b.doctorUserId === person.id);

      const days: BoardDay[] = dates.map((date) => {
        const weekday = clinicWeekday(date);
        const forDay = mine.filter((t) => t.dayOfWeek === weekday);

        const dayStart = clinicInstant(date, "00:00").getTime();
        const dayEnd = dayStart + 86_400_000;
        const bookedToday = myBookings.filter((b) => {
          const at = new Date(b.scheduledAt).getTime();
          return at >= dayStart && at < dayEnd;
        }).length;

        const onLeave = myLeave.find(
          (l) => l.startDate <= date && l.endDate >= date && !l.startTime && !l.endTime,
        );
        if (onLeave) {
          return { date, capacity: 0, booked: bookedToday, closedReason: onLeave.reason ?? "On leave" };
        }
        if (!forDay.length) {
          return { date, capacity: 0, booked: bookedToday, closedReason: "Not working" };
        }

        // Part-day absences remove the slots they cover, so a half day shows as
        // half the capacity rather than as a normal day.
        const partial = myLeave
          .filter((l) => l.startDate <= date && l.endDate >= date && l.startTime && l.endTime)
          .map((l) => ({ from: toMinutes(l.startTime!), to: toMinutes(l.endTime!) }));

        let capacity = 0;
        for (const t of forDay) {
          const from = toMinutes(t.startTime);
          const to = toMinutes(t.endTime);
          const step = Math.max(5, t.slotMinutes);
          for (let m = from; m + step <= to; m += step) {
            if (partial.some((p) => m < p.to && m + step > p.from)) continue;
            capacity += t.capacity;
          }
        }

        return { date, capacity, booked: bookedToday, closedReason: null };
      });

      const totalCapacity = days.reduce((n, d) => n + d.capacity, 0);
      const totalBooked = days.reduce((n, d) => n + d.booked, 0);

      return {
        clinicianId: person.id,
        name: person.name,
        role: person.role,
        days,
        totalCapacity,
        totalBooked,
        // Null rather than 0% for somebody with no hours: those are different
        // facts, and only one of them means "they are not busy".
        utilisation: totalCapacity > 0 ? totalBooked / totalCapacity : null,
        noHoursSet: mine.length === 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { dates, rows };
}

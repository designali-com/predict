// What is this person here for?
//
// The front desk used to have to ask — "therapy ya consultation?" — and then
// pick a visit type from a dropdown. Both are the wrong way round. The clinic
// already knows: a course is activated with every one of its days planned on a
// date, so who is due for therapy today was decided weeks ago, and the patient
// standing at the counter is not a better source for it than the schedule.
//
// So the desk asks for a phone number and this answers. Nothing here is a
// decision — it reads rows that already exist and says what they mean.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { appointment, planEnrollment, planSitting, therapyBooking } from "./schema";
import type * as schema from "./schema";
import { EnrollmentStatus, SittingStatus } from "./treatment-plan";
import { clinicDate } from "./availability-service";

type Database = NodePgDatabase<typeof schema>;

export const DeskIntent = {
  /** On a course with sittings still to give — today's can be logged. */
  THERAPY: "therapy",
  /** Kept for old callers; no longer returned (nothing is dated ahead). */
  THERAPY_EARLY: "therapy_early",
  /** No active course — this is an assessment. */
  CONSULTATION: "consultation",
} as const;

export type DeskIntent = (typeof DeskIntent)[keyof typeof DeskIntent];

/**
 * How long into a course before a review consultation is worth prompting for.
 *
 * A prompt, never a rule. The clinic reviews "about a week in", and nothing
 * schedules that — so this raises the question at the desk and stops there. It
 * does not create a visit, block anything, or expire.
 */
export const REVIEW_PROMPT_DAYS = 7;

export interface DeskSitting {
  id: string;
  dayNumber: number;
  plannedDate: string;
  mode: string;
  status: string;
  appointmentId: string | null;
  /** Negative means it was due in the past. */
  daysFromToday: number;
}

export interface DeskAnswer {
  intent: DeskIntent;
  /** One line, ready to print: "Day 9 of 21 — due today". */
  headline: string;
  /** The course it belongs to, or why there isn't one. */
  detail: string;
  enrollment: {
    id: string;
    planName: string;
    sittings: number;
    startDate: string | null;
  } | null;
  /** Kept for old callers; always null now — sittings are written when given. */
  sitting: DeskSitting | null;
  /** The number the next sitting will be, and how many are done. */
  nextSitting: number | null;
  sittingsDone: number;
  /** Their therapy-calendar booking today, if they have one. */
  bookedToday: { id: string; hour: number } | null;
  /** Whether a sitting has already been logged today. */
  loggedToday: boolean;
  /** Worth asking whether the doctor wants to see them — see REVIEW_PROMPT_DAYS. */
  reviewSuggested: boolean;
}

const NO_COURSE: DeskAnswer = {
  intent: DeskIntent.CONSULTATION,
  headline: "No active course",
  detail: "Book a consultation.",
  enrollment: null,
  sitting: null,
  nextSitting: null,
  sittingsDone: 0,
  bookedToday: null,
  loggedToday: false,
  reviewSuggested: false,
};

function dayGap(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * What the desk should offer this contact, right now.
 *
 * The order is what a receptionist would do standing there: a day due today
 * first, then one that was missed and can still be given, then one that is
 * coming. Only when there is no course at all is this a consultation.
 */
export async function deskAnswerFor(
  db: Database,
  contactId: string,
  today = clinicDate(0),
): Promise<DeskAnswer> {
  const [course] = await db
    .select()
    .from(planEnrollment)
    .where(
      and(eq(planEnrollment.contactId, contactId), eq(planEnrollment.status, EnrollmentStatus.ACTIVE)),
    )
    // The most recently started course, for the rare patient on two.
    .orderBy(desc(planEnrollment.startDate))
    .limit(1);

  if (!course) return NO_COURSE;

  const enrollment = {
    id: course.id,
    planName: course.planName,
    sittings: course.sittings,
    startDate: course.startDate,
  };

  // Has a doctor seen them since the course started? Only asked to decide
  // whether to prompt for a review — it changes nothing else.
  const started = course.startDate;
  let reviewSuggested = false;
  if (started && dayGap(started, today) >= REVIEW_PROMPT_DAYS) {
    const [seen] = await db
      .select({ id: appointment.id })
      .from(appointment)
      .where(and(eq(appointment.contactId, contactId), eq(appointment.type, "review")))
      .limit(1);
    reviewSuggested = !seen;
  }

  // Nothing is dated ahead any more: a sitting is written when it is given.
  // So the question is only how many are done, and whether today's is.
  const [counts] = await db
    .select({
      done: sql<number>`count(*) filter (where ${planSitting.status} = 'done')::int`,
      today: sql<number>`count(*) filter (where ${planSitting.status} = 'done' and ${planSitting.plannedDate} = ${today})::int`,
    })
    .from(planSitting)
    .where(eq(planSitting.enrollmentId, course.id));
  const done = counts?.done ?? 0;
  const loggedToday = (counts?.today ?? 0) > 0;

  // Their hour on the therapy calendar today, if they booked one.
  const [y, m, d] = today.split("-").map(Number);
  const dayStart = new Date(Date.UTC(y!, m! - 1, d!) - 330 * 60 * 1000);
  const [booking] = await db
    .select({ id: therapyBooking.id, startsAt: therapyBooking.startsAt })
    .from(therapyBooking)
    .where(
      and(
        eq(therapyBooking.contactId, contactId),
        eq(therapyBooking.status, "booked"),
        gte(therapyBooking.startsAt, dayStart),
        lt(therapyBooking.startsAt, new Date(dayStart.getTime() + 86_400_000)),
      ),
    )
    .orderBy(asc(therapyBooking.startsAt))
    .limit(1);
  const bookedToday = booking
    ? { id: booking.id, hour: new Date(booking.startsAt.getTime() + 330 * 60 * 1000).getUTCHours() }
    : null;

  if (done >= course.sittings) {
    return {
      intent: DeskIntent.CONSULTATION,
      headline: "Course finished",
      detail: `${course.planName} · all ${course.sittings} sittings given`,
      enrollment,
      sitting: null,
      nextSitting: null,
      sittingsDone: done,
      bookedToday,
      loggedToday,
      reviewSuggested,
    };
  }

  const next = done + 1;
  return {
    intent: DeskIntent.THERAPY,
    headline: loggedToday
      ? `Today's sitting is logged — ${done} of ${course.sittings} done`
      : `Sitting ${next} of ${course.sittings}${bookedToday ? ` — booked ${bookedToday.hour}:00` : ""}`,
    detail: course.planName,
    enrollment,
    sitting: null,
    nextSitting: next,
    sittingsDone: done,
    bookedToday,
    loggedToday,
    reviewSuggested,
  };
}

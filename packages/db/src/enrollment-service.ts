import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  appointment,
  contact,
  planEnrollment,
  planEnrollmentItem,
  payment,
  planSitting,
  therapyBooking,
  treatmentPlan,
  treatmentPlanItem,
} from "./schema";
import type * as schema from "./schema";
import { emitDomainEvent } from "./emit-domain-event";
import { DomainEventType } from "./domain-events";
import {
  EnrollmentStatus,
  isSittingMode,
  isSittingStatus,
  planProgress,
  planTotals,
  SittingMode,
  SittingSource,
  SittingStatus,
  type PlanProgress,
  enrollmentBill,
  resolveDiscount,
  type EnrollmentBill,
} from "./treatment-plan";
import { PaymentKind, planBalance } from "./payment";
import { consumeForSitting } from "./stock-service";
import { markArrived } from "./arrival";
import { clinicMoment, pastClinicDate } from "./clinic-time";

type Database = NodePgDatabase<typeof schema>;

/** YYYY-MM-DD and nothing else — a start date is a calendar day, not a moment. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Putting a patient on a course, and keeping the day-by-day record of it.
 *
 * This lives in the shared package because three places touch it: the clinic
 * panel enrols and logs on the patient's behalf, the operations console needs
 * to see the same schedule when someone rings up about a missed day, and the
 * patient app lets them tick their own at-home sittings. Three copies of
 * "marking day 9 done also advances the enrolment" is exactly the rule that
 * drifts apart and then nobody can say which screen is right.
 */

/** The clinic's local day as YYYY-MM-DD — the calendar the log sheet is on. */
export function clinicToday(now: Date = new Date()): string {
  // Asia/Kolkata is UTC+5:30 and never changes; formatting through the locale
  // machinery for one fixed offset would be slower and no more correct.
  const shifted = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** A discount as the desk or the doctor gives it: rupees, or a percentage of the package. */
export interface DiscountInput {
  mode: "amount" | "percent";
  /** Rupees when mode is "amount". */
  value: number;
  reason?: string | null;
}

export interface EnrollParams {
  contactId: string;
  /** The clinic selling the course — the one the person enrolling them is working in. */
  clinicId: string | null;
  treatmentPlanId: string;
  startDate: string;
  discount?: DiscountInput | null;
  /**
   * The older way of giving a discount: the price charged. Still accepted, and
   * turned into a discount off the package, so the bill can show both.
   */
  priceInPaise?: number | null;
  /** Applied to every generated sitting; individual days can be changed after. */
  mode?: string;
  notes?: string | null;
  actorId?: string | null;
}

/**
 * The discount a new course starts with, from whichever way it was given.
 * Price charged = package less the discount, always.
 */
function openingDiscount(
  grossInPaise: number,
  params: { discount?: DiscountInput | null; priceInPaise?: number | null },
) {
  if (params.discount) {
    const d = resolveDiscount(grossInPaise, params.discount);
    return { ...d, discountReason: params.discount.reason?.trim() || null, priceInPaise: grossInPaise - d.discountInPaise };
  }
  if (params.priceInPaise != null && params.priceInPaise < grossInPaise) {
    if (params.priceInPaise < 0) throw new Error("The price cannot be negative.");
    return { discountInPaise: grossInPaise - params.priceInPaise, discountPercent: null, discountReason: null, priceInPaise: params.priceInPaise };
  }
  return { discountInPaise: 0, discountPercent: null, discountReason: null, priceInPaise: params.priceInPaise ?? grossInPaise };
}

export interface EnrollResult {
  enrollmentId: string;
  sittings: number;
  stageChangedTo: string | null;
}

/**
 * Enrol a contact on a plan and lay out every one of its days.
 *
 * The whole course is written up front rather than a day at a time. A schedule
 * that only exists once each day arrives cannot be looked at, cannot be
 * rearranged, and gives nobody a list of who is due tomorrow — which is the
 * only reason the front desk opens this at all.
 *
 * This is also where somebody becomes a patient. Attending a consultation used
 * to do it, and that was wrong: people attend once and never return. Buying a
 * course is the first commitment in either direction.
 */
export async function enrollInPlan(db: Database, params: EnrollParams): Promise<EnrollResult> {
  const [plan] = await db
    .select()
    .from(treatmentPlan)
    .where(eq(treatmentPlan.id, params.treatmentPlanId))
    .limit(1);
  if (!plan) throw new Error("That plan no longer exists.");
  if (!plan.isActive) throw new Error(`"${plan.name}" is retired and cannot be sold.`);

  if (!DATE_ONLY.test(params.startDate)) throw new Error("Pick a start date.");

  const items = await db
    .select()
    .from(treatmentPlanItem)
    .where(eq(treatmentPlanItem.planId, plan.id))
    .orderBy(asc(treatmentPlanItem.sortOrder));

  // The Treatment line's quantity is the number of sittings — one source of
  // truth, so a plan cannot promise 21 days on the bill and lay out 42 on the
  // log sheet. The cached column is the fallback for a plan with no lines yet.
  const totals = planTotals(items);
  const sittingCount = totals.sittings || plan.sittings;
  if (sittingCount < 1) {
    throw new Error(`"${plan.name}" has no treatment sittings on it — add a Treatment line first.`);
  }

  // The lines are the package. The cached column only fills in for a plan that
  // has none; a discount comes off whichever it is.
  const discount = openingDiscount(items.length ? totals.netInPaise : plan.priceInPaise, params);
  return db.transaction(async (tx) => {
    const [enrollment] = await tx
      .insert(planEnrollment)
      .values({
        clinicId: params.clinicId,
        contactId: params.contactId,
        treatmentPlanId: plan.id,
        // Snapshot, not a lookup — see the note on the table.
        planName: plan.name,
        limbs: plan.limbs,
        durationDays: plan.durationDays,
        sittings: sittingCount,
        priceInPaise: discount.priceInPaise,
        discountInPaise: discount.discountInPaise,
        discountPercent: discount.discountPercent,
        discountReason: discount.discountReason,
        advancePercent: plan.advancePercent,
        startDate: params.startDate,
        status: EnrollmentStatus.ACTIVE,
        activatedAt: new Date(),
        notes: params.notes?.trim() || null,
        enrolledByUserId: params.actorId ?? null,
      })
      .returning();

    // The bill as it stood today. Copied, never re-read: repricing the
    // catalogue next month must not change what this patient was charged, or
    // how many sachets they were handed.
    if (items.length) {
      await tx.insert(planEnrollmentItem).values(
        items.map((item) => ({
          enrollmentId: enrollment!.id,
          kind: item.kind,
          // Carried across, or the patient's own bill points at a name
          // rather than a stock item — and then nothing can say who is on
          // this medicine, or take it off the shelf when their therapy runs.
          medicineId: item.medicineId,
          name: item.name,
          rateInPaise: item.rateInPaise,
          quantity: item.quantity,
          isExtra: false,
          sortOrder: item.sortOrder,
          addedByUserId: params.actorId ?? null,
        })),
      );
    }

    // No days are written ahead. A sitting is logged when the patient comes
    // (logSittingVisit) — so a Sunday, a festival or a day they did not turn
    // up never has to be crossed out, and never pushes anything along.

    // Guarded on the stages that precede treatment. Re-enrolling somebody who
    // is already a PATIENT changes nothing, and enrolling someone marked LOST
    // or INACTIVE is a deliberate act by a person, so it moves them too.
    const [moved] = await tx
      .update(contact)
      .set({ stage: "PATIENT", updatedAt: new Date() })
      .where(
        and(
          eq(contact.id, params.contactId),
          inArray(contact.stage, ["LEAD", "BOOKED", "INACTIVE", "LOST"]),
        ),
      )
      .returning();

    await emitDomainEvent(
      tx,
      DomainEventType.PLAN_ENROLLED,
      {
        enrollmentId: enrollment!.id,
        planName: plan.name,
        limbs: plan.limbs,
        sittings: sittingCount,
        netInPaise: discount.priceInPaise,
        startDate: params.startDate,
      },
      { contactId: params.contactId },
    );

    if (moved) {
      await emitDomainEvent(
        tx,
        DomainEventType.CONTACT_STAGE_CHANGED,
        { contactId: params.contactId, stage: "PATIENT" },
        { contactId: params.contactId },
      );
    }

    return {
      enrollmentId: enrollment!.id,
      sittings: sittingCount,
      stageChangedTo: moved ? "PATIENT" : null,
    };
  });
}

export interface LogSittingParams {
  sittingId: string;
  status?: string;
  mode?: string;
  note?: string | null;
  /** patient | staff — see SittingSource. */
  source: string;
  actorId?: string | null;
  /** Restricts the write to this contact's own sittings. */
  contactId?: string;
  /**
   * The clinic the session happened at, whose shelf it draws on. Defaults to
   * the course's clinic — see consumeForSitting.
   */
  clinicId?: string | null;
}

/**
 * One line of the log sheet.
 *
 * `completedAt` is stamped from the clock rather than taken from the caller: a
 * patient ticking day 4 three days late has done day 4, and the planned date
 * already says which day it was. Storing a claimed completion time would let
 * the log sheet assert a therapy happened at a moment nobody observed.
 */
export async function logSitting(db: Database, params: LogSittingParams) {
  const filters = [eq(planSitting.id, params.sittingId)];
  if (params.contactId) filters.push(eq(planSitting.contactId, params.contactId));

  const [existing] = await db
    .select()
    .from(planSitting)
    .where(and(...filters))
    .limit(1);
  if (!existing) throw new Error("That sitting is not on this patient's plan.");

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (params.mode !== undefined) {
    if (!isSittingMode(params.mode)) throw new Error("Pick in clinic or at home.");
    patch.mode = params.mode;
  }

  if (params.status !== undefined) {
    if (!isSittingStatus(params.status)) throw new Error("Pick done, missed or pending.");
    patch.status = params.status;
    patch.completedAt = params.status === SittingStatus.DONE ? new Date() : null;
    // Reverting to pending clears who said otherwise, so the row never claims
    // a source for an answer it no longer holds.
    patch.loggedSource = params.status === SittingStatus.PENDING ? null : params.source;
    patch.loggedByUserId = params.status === SittingStatus.PENDING ? null : (params.actorId ?? null);
  }

  if (params.note !== undefined) patch.note = params.note?.trim() || null;

  const [updated] = await db
    .update(planSitting)
    .set(patch)
    .where(eq(planSitting.id, existing.id))
    .returning();

  if (params.status && params.status !== existing.status) {
    await emitDomainEvent(
      db,
      DomainEventType.SITTING_LOGGED,
      {
        sittingId: existing.id,
        enrollmentId: existing.enrollmentId,
        dayNumber: existing.dayNumber,
        status: params.status,
        mode: updated!.mode,
        source: params.source,
      },
      { contactId: existing.contactId },
    );
    // Stock follows the therapy. A clinic session takes what it uses off the
    // shelf the moment it is recorded as having happened — which is the only
    // way "how much is left" stays true without somebody remembering to also
    // update a stock screen.
    if (params.status === SittingStatus.DONE) {
      await consumeForSitting(db, {
        sittingId: existing.id,
        actorId: params.actorId,
        clinicId: params.clinicId,
      });
    }

    await closeIfFinished(db, existing.enrollmentId);
  }

  return updated!;
}

/**
 * A course with no unanswered days left is over.
 *
 * Done automatically because nobody remembers to close one by hand, and an
 * enrolment left "active" forever keeps the patient on every due-today list
 * long after their last sitting.
 */
async function closeIfFinished(db: Database, enrollmentId: string): Promise<void> {
  // An open-ended course is never finished. It has no agreed number of days —
  // the patient comes when they feel like it — so "no unanswered days left"
  // just means they are not booked in right now, which is its normal state.
  //
  // Closing it anyway was worse than cosmetic: the next walk-in session could
  // not find an active enrolment to attach to, so every visit started a new
  // course and every one of them was "session 1".
  const [course] = await db
    .select({ isPerSession: planEnrollment.isPerSession, sittings: planEnrollment.sittings })
    .from(planEnrollment)
    .where(eq(planEnrollment.id, enrollmentId))
    .limit(1);

  if (!course || course.isPerSession) return;

  // Finished when every sitting sold has been given — counted, not inferred
  // from the absence of unanswered rows (there are none written ahead now).
  // What the patient ticks at home is their own diary, not a sitting the clinic
  // sold or gave — it never closes a course.
  const [row] = await db
    .select({ done: sql<number>`count(*) filter (where ${planSitting.status} = 'done' and coalesce(${planSitting.loggedSource}, 'staff') <> 'patient')::int` })
    .from(planSitting)
    .where(eq(planSitting.enrollmentId, enrollmentId));

  if ((row?.done ?? 0) < course.sittings) return;

  const [closed] = await db
    .update(planEnrollment)
    .set({ status: EnrollmentStatus.COMPLETED, updatedAt: new Date() })
    .where(and(eq(planEnrollment.id, enrollmentId), eq(planEnrollment.status, EnrollmentStatus.ACTIVE)))
    .returning();

  if (closed) {
    await emitDomainEvent(
      db,
      DomainEventType.PLAN_COMPLETED,
      { enrollmentId, planName: closed.planName },
      { contactId: closed.contactId },
    );
  }
}

export interface LogSittingVisitParams {
  enrollmentId: string;
  /** The patient's own id, to stop a sitting landing on somebody else's course. */
  contactId?: string;
  /**
   * Clinic day it happened, YYYY-MM-DD. Defaults to today. An earlier day is
   * how a sitting is written up afterwards — from the paper sheet, or for an
   * older patient's course from before the system.
   */
  date?: string;
  mode?: string;
  /** PNG data URL from the signature pad. */
  signatureDataUrl?: string | null;
  signedName?: string | null;
  note?: string | null;
  /** The therapy-calendar booking this was the visit for. */
  bookingId?: string | null;
  actorId?: string | null;
}

const MAX_SIGNATURE_BYTES = 512 * 1024;

/**
 * The patient came and was treated: write the sitting.
 *
 * This is the only way a sitting comes into being now. Nothing is written
 * ahead when a course starts, so there is no Sunday to cross out and no
 * missed day to push along — the course is the number of sittings sold, and
 * this adds one, signed by the patient. Stock comes off the shelf as it
 * always did, and the course closes when it is complete.
 *
 * Sittings are numbered in date order, so one written up for an earlier day
 * takes its place among the others rather than going to the end.
 */
export async function logSittingVisit(db: Database, params: LogSittingVisitParams) {
  const [course] = await db
    .select()
    .from(planEnrollment)
    .where(eq(planEnrollment.id, params.enrollmentId))
    .limit(1);
  if (!course) throw new Error("That course does not exist.");
  if (params.contactId && course.contactId !== params.contactId) throw new Error("That course is not this patient's.");
  if (course.status !== EnrollmentStatus.ACTIVE) {
    throw new Error(
      course.status === EnrollmentStatus.PRESCRIBED
        ? "Start the course first — take the advance and press Start."
        : `This course is ${course.status}; it takes no more sittings.`,
    );
  }

  const signature = params.signatureDataUrl?.trim() || null;
  if (signature && (!signature.startsWith("data:image/") || signature.length > MAX_SIGNATURE_BYTES)) {
    throw new Error("The signature could not be read — take it again.");
  }
  const date = pastClinicDate(params.date);
  if (course.startDate && date < course.startDate) {
    throw new Error(`That is before the course started (${course.startDate}). Change the course start date first if it began earlier.`);
  }
  const mode = isSittingMode(params.mode) ? params.mode : SittingMode.IN_CLINIC;

  const sitting = await db.transaction(async (tx) => {
    const t = tx as unknown as Database;
    // Lock the course row so two desks logging at once cannot both be "day 5".
    await t.execute(sql`select 1 from ${planEnrollment} where ${planEnrollment.id} = ${course.id} for update`);
    const [counts] = await t
      .select({
        // The patient's home diary does not use up the sittings sold.
        done: sql<number>`count(*) filter (where ${planSitting.status} = 'done' and coalesce(${planSitting.loggedSource}, 'staff') <> 'patient')::int`,
        last: sql<number>`coalesce(max(${planSitting.dayNumber}), 0)::int`,
      })
      .from(planSitting)
      .where(eq(planSitting.enrollmentId, course.id));
    if (!course.isPerSession && (counts?.done ?? 0) >= course.sittings) {
      throw new Error(`All ${course.sittings} sittings of this course are already logged.`);
    }
    // The paid sittings come first; once they are given, the rest are the
    // clinic's free ones — no medicine is taken for those.
    const isFree = !course.isPerSession && course.freeSittings > 0 && (counts?.done ?? 0) >= course.sittings - course.freeSittings;
    const now = new Date();
    const [row] = await t
      .insert(planSitting)
      .values({
        enrollmentId: course.id,
        contactId: course.contactId,
        // After the last number ever used, so an old crossed-out row can
        // never collide with it.
        dayNumber: (counts?.last ?? 0) + 1,
        plannedDate: date,
        mode,
        isFree,
        status: SittingStatus.DONE,
        // The day it happened; signedAt below stays the moment it was signed.
        completedAt: clinicMoment(date, now),
        loggedSource: SittingSource.STAFF,
        loggedByUserId: params.actorId ?? null,
        note: params.note?.trim() || null,
        signatureDataUrl: signature,
        signedName: params.signedName?.trim() || null,
        signedAt: signature ? now : null,
        bookingId: params.bookingId ?? null,
      })
      .returning();
    // Renumber the course in date order (then the order written), so a
    // back-dated sitting gets its rightful number and the later ones move up.
    // Through negatives first: (course, number) is unique and checked row by row.
    await t.execute(sql`
      update plan_sitting ps set day_number = -r.n
      from (
        select id, row_number() over (order by planned_date, created_at, id)::int as n
        from plan_sitting where enrollment_id = ${course.id}
      ) r
      where ps.id = r.id`);
    await t.execute(sql`update plan_sitting set day_number = -day_number where enrollment_id = ${course.id} and day_number < 0`);
    const [numbered] = await t.select().from(planSitting).where(eq(planSitting.id, row!.id)).limit(1);
    if (course.isPerSession) {
      await t
        .update(planEnrollment)
        .set({ sittings: sql`${planEnrollment.sittings} + 1`, updatedAt: now })
        .where(eq(planEnrollment.id, course.id));
    }
    if (params.bookingId) {
      await t
        .update(therapyBooking)
        .set({ status: "attended", sittingId: row!.id, enrollmentId: course.id, updatedAt: now })
        .where(and(eq(therapyBooking.id, params.bookingId), eq(therapyBooking.contactId, course.contactId)));
    }
    return numbered ?? row!;
  });

  await emitDomainEvent(
    db,
    DomainEventType.SITTING_LOGGED,
    { sittingId: sitting.id, enrollmentId: course.id, dayNumber: sitting.dayNumber, status: SittingStatus.DONE, mode, source: SittingSource.STAFF },
    { contactId: course.contactId },
  );
  await consumeForSitting(db, { sittingId: sitting.id, actorId: params.actorId });
  await closeIfFinished(db, course.id);
  return sitting;
}

/**
 * The patient's own record of a day's therapy at home — done, or missed.
 *
 * Their diary, not the clinic's: it is written as theirs (logged_source
 * patient), it takes nothing off the shelf, and it never counts toward the
 * sittings sold or closes the course — those stay the clinic's observation.
 * One answer per day: a day the clinic already recorded is not theirs to
 * change, and asking again about the same day updates their own answer.
 */
export async function logHomeTherapy(
  db: Database,
  params: { enrollmentId: string; contactId: string; date: string; status: "done" | "missed"; note?: string | null; actorId?: string | null },
) {
  if (params.status !== SittingStatus.DONE && params.status !== SittingStatus.MISSED) throw new Error("Say whether you did it or missed it.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) throw new Error("Pick the day.");
  const [course] = await db.select().from(planEnrollment).where(eq(planEnrollment.id, params.enrollmentId)).limit(1);
  if (!course || course.contactId !== params.contactId) throw new Error("That course is not yours.");
  if (!isPurchasedCourse(course)) throw new Error("This course has not started yet.");
  if (course.status === EnrollmentStatus.CANCELLED) throw new Error("This course was stopped.");
  const today = clinicToday();
  if (params.date > today) throw new Error("You can log a day once it has come.");
  const start = course.startDate ?? (course.activatedAt ? clinicToday(course.activatedAt) : today);
  if (params.date < start) throw new Error("That day is before your course began.");

  const sameDay = await db
    .select()
    .from(planSitting)
    .where(and(eq(planSitting.enrollmentId, course.id), eq(planSitting.plannedDate, params.date)));
  if (sameDay.some((s) => s.loggedSource !== SittingSource.PATIENT && s.status !== SittingStatus.PENDING)) {
    throw new Error("The clinic has already recorded that day.");
  }
  const mine = sameDay.find((s) => s.loggedSource === SittingSource.PATIENT || (s.status === SittingStatus.PENDING && s.mode === SittingMode.AT_HOME));
  const now = new Date();
  if (mine) {
    const [updated] = await db
      .update(planSitting)
      .set({
        status: params.status,
        mode: SittingMode.AT_HOME,
        completedAt: params.status === SittingStatus.DONE ? now : null,
        loggedSource: SittingSource.PATIENT,
        loggedByUserId: params.actorId ?? null,
        note: params.note?.trim() || mine.note,
        updatedAt: now,
      })
      .where(eq(planSitting.id, mine.id))
      .returning();
    return updated!;
  }
  const [{ last } = { last: 0 }] = await db
    .select({ last: sql<number>`coalesce(max(${planSitting.dayNumber}), 0)::int` })
    .from(planSitting)
    .where(eq(planSitting.enrollmentId, course.id));
  const [row] = await db
    .insert(planSitting)
    .values({
      enrollmentId: course.id,
      contactId: course.contactId,
      dayNumber: (last ?? 0) + 1,
      plannedDate: params.date,
      mode: SittingMode.AT_HOME,
      status: params.status,
      completedAt: params.status === SittingStatus.DONE ? now : null,
      loggedSource: SittingSource.PATIENT,
      loggedByUserId: params.actorId ?? null,
      note: params.note?.trim() || null,
    })
    .returning();
  return row!;
}

export interface EnrollmentWithSittings {
  enrollment: typeof planEnrollment.$inferSelect;
  sittings: (typeof planSitting.$inferSelect)[];
  /** The bill: the package lines, plus anything dispensed on top of it. */
  items: (typeof planEnrollmentItem.$inferSelect)[];
  progress: PlanProgress;
  /** Package net, extras, and the two together — what is actually owed. */
  billing: EnrollmentBill;
}

/**
 * A course the patient actually bought: prescribed by the doctor AND paid for
 * and started. A prescription on its own (status "prescribed", no start date)
 * is a recommendation the patient may still decline — it is not their therapy,
 * and the patient app must not present it as if it were. A cancelled course
 * counts only if it had begun; one cancelled before starting was never theirs.
 */
export function isPurchasedCourse(e: typeof planEnrollment.$inferSelect): boolean {
  return e.status !== EnrollmentStatus.PRESCRIBED && Boolean(e.activatedAt || e.startDate);
}

/** Whether this contact has any bought course — for showing the therapy page at all. */
export async function hasPurchasedCourse(db: Database, contactId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(planEnrollment)
    .where(eq(planEnrollment.contactId, contactId));
  return rows.some(isPurchasedCourse);
}

/** One patient's courses, newest first, each with its full log sheet. */
export async function enrollmentsForContact(
  db: Database,
  contactId: string,
): Promise<EnrollmentWithSittings[]> {
  const enrollments = await db
    .select()
    .from(planEnrollment)
    .where(eq(planEnrollment.contactId, contactId))
    .orderBy(desc(planEnrollment.startDate), desc(planEnrollment.createdAt));

  if (!enrollments.length) return [];

  const sittings = await db
    .select()
    .from(planSitting)
    .where(
      inArray(
        planSitting.enrollmentId,
        enrollments.map((e) => e.id),
      ),
    )
    .orderBy(asc(planSitting.dayNumber));

  const items = await db
    .select()
    .from(planEnrollmentItem)
    .where(
      inArray(
        planEnrollmentItem.enrollmentId,
        enrollments.map((e) => e.id),
      ),
    )
    .orderBy(asc(planEnrollmentItem.sortOrder));

  const today = clinicToday();
  return enrollments.map((enrollment) => {
    const own = sittings.filter((s) => s.enrollmentId === enrollment.id);
    const bill = items.filter((i) => i.enrollmentId === enrollment.id);

    // Extras are totalled apart from the package. Rolling them together would
    // make the course look like it cost more than it was sold for, which is
    // the number somebody quotes back over the phone.
    return {
      enrollment,
      sittings: own,
      items: bill,
      progress: planProgress(own, today, enrollment.isPerSession ? undefined : enrollment.sittings),
      billing: enrollmentBill(enrollment, bill),
    };
  });
}

export interface AddExtraItemParams {
  enrollmentId: string;
  name: string;
  rateInPaise: number;
  quantity: number;
  actorId?: string | null;
}

/**
 * "If your body requires extra medicine then you have to buy extra flat cost"
 * — the note at the bottom of the clinic's own package sheet.
 *
 * Recorded against the enrolment and flagged, rather than edited into the
 * package lines. The package is what the patient agreed to; an extra is a
 * separate thing they were sold afterwards, and mixing the two makes the
 * agreed price unrecoverable.
 *
 * Never a treatment line. Extra sittings are not extra medicine — they are a
 * longer course, which is another enrolment with its own schedule, and adding
 * one here would charge for days the log sheet does not have.
 */
export async function addExtraItem(db: Database, params: AddExtraItemParams) {
  const name = params.name.trim();
  if (!name) throw new Error("Name the medicine.");
  if (!Number.isInteger(params.quantity) || params.quantity < 1) {
    throw new Error("Quantity must be at least 1.");
  }
  if (!Number.isInteger(params.rateInPaise) || params.rateInPaise < 0) {
    throw new Error("Rate cannot be negative.");
  }

  const [enrollment] = await db
    .select()
    .from(planEnrollment)
    .where(eq(planEnrollment.id, params.enrollmentId))
    .limit(1);
  if (!enrollment) throw new Error("That course no longer exists.");

  const [created] = await db
    .insert(planEnrollmentItem)
    .values({
      enrollmentId: enrollment.id,
      kind: "medicine",
      name,
      rateInPaise: params.rateInPaise,
      quantity: params.quantity,
      isExtra: true,
      // After every package line, in the order they were dispensed.
      sortOrder: 1000 + Math.floor(Date.now() / 1000) % 1000,
      addedByUserId: params.actorId ?? null,
    })
    .returning();

  return created!;
}

/** Remove an extra. Package lines are the agreement and cannot be deleted. */
export async function removeExtraItem(db: Database, itemId: string): Promise<void> {
  await db
    .delete(planEnrollmentItem)
    .where(and(eq(planEnrollmentItem.id, itemId), eq(planEnrollmentItem.isExtra, true)));
}
/**
 * Attach an in-clinic sitting to the visit that was booked for it.
 *
 * Without this the same day exists twice — once as an appointment the front
 * desk sees and once as a therapy day the log sheet sees — and marking one
 * leaves the other saying the opposite.
 */
export async function linkSittingToAppointment(
  db: Database,
  sittingId: string,
  appointmentId: string,
): Promise<void> {
  await db
    .update(planSitting)
    .set({ appointmentId, mode: SittingMode.IN_CLINIC, updatedAt: new Date() })
    .where(eq(planSitting.id, sittingId));
}

/**
 * Marking a visit attended also marks the therapy day it was booked for.
 *
 * Called from the appointment outcome path. A therapist who marks the visit
 * completed has said the therapy happened; making them then tick the same day
 * on a second screen is how log sheets end up half-filled.
 */
export async function applyAppointmentToSitting(
  db: Database,
  params: { appointmentId: string; status: string; actorId?: string | null },
): Promise<void> {
  const status =
    params.status === "completed"
      ? SittingStatus.DONE
      : params.status === "no_show"
        ? SittingStatus.MISSED
        : null;
  // cancelled leaves the day pending on purpose: a cancelled visit can be
  // rebooked, and calling it missed writes off a sitting the patient still owns.
  if (!status) return;

  const [sitting] = await db
    .select({ id: planSitting.id })
    .from(planSitting)
    .where(eq(planSitting.appointmentId, params.appointmentId))
    .limit(1);
  if (!sitting) return;

  await logSitting(db, {
    sittingId: sitting.id,
    status,
    source: "staff",
    actorId: params.actorId ?? null,
  });
}

/**
 * The patient is here for their therapy day — put them in the book.
 *
 * This is the front desk's whole job for a therapy visit, and it deliberately
 * asks nothing. The day already exists with a date, a course and a day number,
 * decided when the course was activated; the only new fact is that they turned
 * up. Nothing here needs a doctor picked, a slot chosen or a visit kind
 * answered, because none of those are things anybody at the desk knows better
 * than the schedule already does.
 *
 * A therapy day is not booked against a doctor's availability on purpose. The
 * patient paid for this day, it was planned for this date, and refusing them
 * because no clinician has typed working hours in would turn an admin gap into
 * a clinical one.
 *
 * Idempotent: checking the same day in twice returns the visit already made,
 * so a double click does not put one patient in the book twice.
 */
export async function checkInSitting(
  db: Database,
  params: { sittingId: string; at?: Date; doctorUserId?: string | null; actorId?: string | null },
): Promise<{ appointmentId: string; created: boolean }> {
  const [sitting] = await db
    .select()
    .from(planSitting)
    .where(eq(planSitting.id, params.sittingId))
    .limit(1);

  if (!sitting) throw new Error("That therapy day does not exist.");
  if (sitting.status === SittingStatus.DONE) {
    throw new Error("That day is already marked done.");
  }
  if (sitting.appointmentId) {
    return { appointmentId: sitting.appointmentId, created: false };
  }

  const [course] = await db
    .select({ clinicId: planEnrollment.clinicId })
    .from(planEnrollment)
    .where(eq(planEnrollment.id, sitting.enrollmentId))
    .limit(1);
  let clinicId = course?.clinicId ?? null;
  if (!clinicId) {
    const [person] = await db
      .select({ clinicId: contact.clinicId })
      .from(contact)
      .where(eq(contact.id, sitting.contactId))
      .limit(1);
    clinicId = person?.clinicId ?? null;
  }

  const [created] = await db
    .insert(appointment)
    .values({
      clinicId,
      contactId: sitting.contactId,
      doctorUserId: params.doctorUserId ?? null,
      scheduledAt: params.at ?? new Date(),
      status: "confirmed",
      // The stored type stays "consultation" because that column only holds
      // what somebody chose. What this visit IS comes from the sitting below —
      // see visit-kind.ts — and it reads as "Therapy · day 9 of 21".
      type: "consultation",
      channel: "in_clinic",
      // A therapy day is paid for by the course, not per visit. Charging the
      // consultation fee here would bill the patient twice for one course.
      feeInPaise: 0,
      enrollmentId: sitting.enrollmentId,
      notes: `Therapy day ${sitting.dayNumber}`,
    })
    .returning();

  if (!created) throw new Error("Could not create that visit.");

  await linkSittingToAppointment(db, sitting.id, created.id);
  // Checking a therapy day in is somebody saying "they are here" — the
  // visit is created at that moment, so it starts already arrived.
  await markArrived(db, created.id, params.at);
  return { appointmentId: created.id, created: true };
}

/**
 * Which clinic a course belongs to, and whose course it is.
 *
 * The course's own clinic when it has one. Courses written before that column
 * was filled in have none, and fall back to their patient's — the same rule
 * checkInSitting follows. Null when there is no such course.
 */
export async function enrollmentOwner(
  db: Database,
  enrollmentId: string,
): Promise<{ contactId: string; clinicId: string | null } | null> {
  const [row] = await db
    .select({
      contactId: planEnrollment.contactId,
      courseClinicId: planEnrollment.clinicId,
      contactClinicId: contact.clinicId,
    })
    .from(planEnrollment)
    .leftJoin(contact, eq(contact.id, planEnrollment.contactId))
    .where(eq(planEnrollment.id, enrollmentId))
    .limit(1);
  if (!row) return null;
  return { contactId: row.contactId, clinicId: row.courseClinicId ?? row.contactClinicId ?? null };
}

/** The same, for one day of a course. */
export async function sittingOwner(db: Database, sittingId: string) {
  const [sitting] = await db
    .select({ enrollmentId: planSitting.enrollmentId })
    .from(planSitting)
    .where(eq(planSitting.id, sittingId))
    .limit(1);
  return sitting ? enrollmentOwner(db, sitting.enrollmentId) : null;
}

/** Everyone with a sitting planned for this date — the day's therapy list. */
export async function sittingsDueOn(db: Database, date: string, clinicId?: string) {
  return db
    .select({
      sitting: planSitting,
      enrollment: planEnrollment,
      contactName: contact.name,
      contactPhone: contact.phone,
      appointmentStatus: appointment.status,
    })
    .from(planSitting)
    .innerJoin(planEnrollment, eq(planEnrollment.id, planSitting.enrollmentId))
    .innerJoin(contact, eq(contact.id, planSitting.contactId))
    .leftJoin(appointment, eq(appointment.id, planSitting.appointmentId))
    .where(
      and(
        eq(planSitting.plannedDate, date),
        eq(planEnrollment.status, EnrollmentStatus.ACTIVE),
        // Therapy due today, at this clinic.
        ...(clinicId ? [eq(contact.clinicId, clinicId)] : []),
      ),
    )
    .orderBy(asc(contact.name));
}

/**
 * Give free sittings on a course — clinic treatments at no charge, on top of
 * what its plan includes: an out-station patient given 3 to 5 for the price
 * of the plan's one, an in-station patient a couple more.
 *
 * The course can then take that many more sittings; its bill does not change.
 * Each sitting past the paid ones is marked free and takes no medicine. No
 * limit — the clinic decides. A course that had finished is running again.
 */
export async function addFreeSittings(
  db: Database,
  params: { enrollmentId: string; count: number; reason?: string | null; actorId?: string | null },
) {
  if (!Number.isInteger(params.count) || params.count < 1 || params.count > 100) throw new Error("Give 1 or more free sittings.");
  const [course] = await db.select().from(planEnrollment).where(eq(planEnrollment.id, params.enrollmentId)).limit(1);
  if (!course) throw new Error("That course does not exist.");
  if (course.isPerSession) throw new Error("A pay-per-session course has no fixed sittings to add to.");
  if (course.status === EnrollmentStatus.CANCELLED) throw new Error("This course was stopped.");

  const reason = params.reason?.trim();
  const note = `${params.count} free sitting${params.count === 1 ? "" : "s"} given on ${clinicToday()}${reason ? ` — ${reason}` : ""}.`;
  const [updated] = await db
    .update(planEnrollment)
    .set({
      sittings: course.sittings + params.count,
      freeSittings: course.freeSittings + params.count,
      status: course.status === EnrollmentStatus.COMPLETED ? EnrollmentStatus.ACTIVE : course.status,
      notes: [course.notes, note].filter(Boolean).join("\n"),
      updatedAt: new Date(),
    })
    .where(eq(planEnrollment.id, course.id))
    .returning();
  return updated!;
}

export interface ExtendCourseParams {
  enrollmentId: string;
  /** The plan whose sittings, days and bill lines are added — "15 Day", say. */
  treatmentPlanId: string;
  /** On the extension only; the course's own discount stays as it was. */
  discount?: DiscountInput | null;
  actorId?: string | null;
}

/** "Four Limbs 21 Day — In Station" + "Four Limbs 15 Day" → "Four Limbs 21 Day + 15 Day — In Station". */
function extendedName(current: string, added: { name: string; durationDays: number }): string {
  const station = current.match(/\s*[—–-]\s*(in|out)[\s-]*station\s*$/i)?.[0] ?? "";
  const base = station ? current.slice(0, -station.length) : current;
  return `${base} + ${added.durationDays} Day${station}`;
}

/**
 * Extend a running course with another plan, instead of starting a second
 * course alongside it.
 *
 * The same course grows: its sittings and days go up by the plan's, the
 * plan's bill lines are added to the package (a line the course already has
 * at the same rate just gets the extra quantity), so what is owed, the
 * medicine the package allots and the sittings left all follow from the one
 * course. A discount given here applies to the extension only. A course that
 * had finished is running again.
 */
export async function extendCourse(db: Database, params: ExtendCourseParams) {
  const [course] = await db.select().from(planEnrollment).where(eq(planEnrollment.id, params.enrollmentId)).limit(1);
  if (!course) throw new Error("That course does not exist.");
  if (course.status !== EnrollmentStatus.ACTIVE && course.status !== EnrollmentStatus.COMPLETED) {
    throw new Error(
      course.status === EnrollmentStatus.PRESCRIBED
        ? "This course has not started — change the prescription instead of extending it."
        : "This course was stopped; prescribe a new one.",
    );
  }
  if (course.isPerSession) throw new Error("A pay-per-session course is not extended — each session is billed as it comes.");

  const [plan] = await db.select().from(treatmentPlan).where(eq(treatmentPlan.id, params.treatmentPlanId)).limit(1);
  if (!plan) throw new Error("That plan no longer exists.");
  if (!plan.isActive) throw new Error(`"${plan.name}" is retired and cannot be used.`);

  const planItems = await db
    .select()
    .from(treatmentPlanItem)
    .where(eq(treatmentPlanItem.planId, plan.id))
    .orderBy(asc(treatmentPlanItem.sortOrder));
  const totals = planTotals(planItems);
  const addSittings = totals.sittings || plan.sittings;
  const grossInPaise = planItems.length ? totals.netInPaise : plan.priceInPaise;
  const discount = params.discount ? resolveDiscount(grossInPaise, params.discount) : { discountInPaise: 0, discountPercent: null };

  return db.transaction(async (tx) => {
    const t = tx as unknown as Database;
    const existing = await t
      .select()
      .from(planEnrollmentItem)
      .where(and(eq(planEnrollmentItem.enrollmentId, course.id), eq(planEnrollmentItem.isExtra, false)));
    let sortOrder = existing.reduce((m, i) => Math.max(m, i.sortOrder), 0);

    for (const item of planItems) {
      const same = existing.find(
        (e) => e.kind === item.kind && e.name === item.name && e.medicineId === item.medicineId && e.rateInPaise === item.rateInPaise,
      );
      if (same) {
        await t
          .update(planEnrollmentItem)
          .set({ quantity: same.quantity + item.quantity })
          .where(eq(planEnrollmentItem.id, same.id));
        same.quantity += item.quantity;
      } else {
        await t.insert(planEnrollmentItem).values({
          enrollmentId: course.id,
          kind: item.kind,
          medicineId: item.medicineId,
          name: item.name,
          rateInPaise: item.rateInPaise,
          quantity: item.quantity,
          isExtra: false,
          sortOrder: ++sortOrder,
          addedByUserId: params.actorId ?? null,
        });
      }
    }

    const note = `Extended by ${plan.name} (+${addSittings} sittings, +${plan.durationDays} days) on ${clinicToday()}.`;
    const [updated] = await t
      .update(planEnrollment)
      .set({
        planName: extendedName(course.planName, plan),
        durationDays: course.durationDays + plan.durationDays,
        sittings: course.sittings + addSittings,
        priceInPaise: course.priceInPaise + grossInPaise - discount.discountInPaise,
        discountInPaise: (course.discountInPaise ?? 0) + discount.discountInPaise,
        // The package grew, so a percentage of the old one no longer describes
        // the discount — the amount in rupees does.
        discountPercent: null,
        status: EnrollmentStatus.ACTIVE,
        notes: [course.notes, note].filter(Boolean).join("\n"),
        updatedAt: new Date(),
      })
      .where(eq(planEnrollment.id, course.id))
      .returning();
    return updated!;
  });
}

export interface PrescribePlanParams {
  contactId: string;
  /** The clinic prescribing it — see EnrollParams.clinicId. */
  clinicId: string | null;
  treatmentPlanId: string;
  /** The visit this was decided at — ties the course to its assessment. */
  appointmentId?: string | null;
  discount?: DiscountInput | null;
  /** The older way of giving a discount — see EnrollParams.priceInPaise. */
  priceInPaise?: number | null;
  notes?: string | null;
  actorId?: string | null;
}

/**
 * A doctor choosing a package at the end of an assessment.
 *
 * Deliberately not the same act as enrolling. At this point nothing is
 * scheduled, nothing is owed and the patient has not agreed to anything — they
 * still see the nutritionist and then the front desk. Writing sittings here
 * would put days on a log sheet for a course that may never be bought, and
 * moving them to PATIENT would claim a conversion the clinic has not made.
 *
 * The bill is snapshotted now, though: the price quoted to the patient is the
 * price on the day they were told it, not on the day they come back to pay.
 */
export async function prescribePlan(db: Database, params: PrescribePlanParams) {
  const [plan] = await db
    .select()
    .from(treatmentPlan)
    .where(eq(treatmentPlan.id, params.treatmentPlanId))
    .limit(1);
  if (!plan) throw new Error("That plan no longer exists.");
  if (!plan.isActive) throw new Error(`"${plan.name}" is retired and cannot be prescribed.`);

  const items = await db
    .select()
    .from(treatmentPlanItem)
    .where(eq(treatmentPlanItem.planId, plan.id))
    .orderBy(asc(treatmentPlanItem.sortOrder));

  const totals = planTotals(items);
  const sittingCount = totals.sittings || plan.sittings;
  const discount = openingDiscount(items.length ? totals.netInPaise : plan.priceInPaise, params);

  return db.transaction(async (tx) => {
    const [enrollment] = await tx
      .insert(planEnrollment)
      .values({
        clinicId: params.clinicId,
        contactId: params.contactId,
        treatmentPlanId: plan.id,
        planName: plan.name,
        limbs: plan.limbs,
        durationDays: plan.durationDays,
        sittings: sittingCount,
        priceInPaise: discount.priceInPaise,
        discountInPaise: discount.discountInPaise,
        discountPercent: discount.discountPercent,
        discountReason: discount.discountReason,
        advancePercent: plan.advancePercent,
        // No schedule yet. That absence is the difference between a
        // prescription and a course.
        startDate: null,
        status: EnrollmentStatus.PRESCRIBED,
        notes: params.notes?.trim() || null,
        prescribedAtAppointmentId: params.appointmentId ?? null,
        prescribedByUserId: params.actorId ?? null,
      })
      .returning();

    if (items.length) {
      await tx.insert(planEnrollmentItem).values(
        items.map((item) => ({
          enrollmentId: enrollment!.id,
          kind: item.kind,
          // Carried across, or the patient's own bill points at a name
          // rather than a stock item — and then nothing can say who is on
          // this medicine, or take it off the shelf when their therapy runs.
          medicineId: item.medicineId,
          name: item.name,
          rateInPaise: item.rateInPaise,
          quantity: item.quantity,
          isExtra: false,
          sortOrder: item.sortOrder,
          addedByUserId: params.actorId ?? null,
        })),
      );
    }

    await emitDomainEvent(
      tx,
      DomainEventType.PLAN_PRESCRIBED,
      {
        enrollmentId: enrollment!.id,
        planName: plan.name,
        limbs: plan.limbs,
        sittings: sittingCount,
        advancePercent: plan.advancePercent,
        appointmentId: params.appointmentId ?? null,
      },
      { contactId: params.contactId },
    );

    return enrollment!;
  });
}

/**
 * Give, change or take away the discount on a course that already exists —
 * agreed at the desk after the doctor prescribed, or corrected later.
 *
 * Measured against the package lines as they are (extras are never
 * discounted), and the stored price follows, so every bill, balance and
 * advance reads the new figure at once. Null clears it.
 */
export async function setEnrollmentDiscount(
  db: Database,
  params: { enrollmentId: string; discount: DiscountInput | null; actorId?: string | null },
) {
  const [enrollment] = await db.select().from(planEnrollment).where(eq(planEnrollment.id, params.enrollmentId)).limit(1);
  if (!enrollment) throw new Error("That course no longer exists.");
  if (enrollment.status === EnrollmentStatus.CANCELLED) throw new Error("This course was stopped; its bill is closed.");
  if (enrollment.isPerSession) throw new Error("A pay-per-session course is charged per session, not discounted as a package.");

  const bill = await db.select().from(planEnrollmentItem).where(eq(planEnrollmentItem.enrollmentId, enrollment.id));
  const { grossInPaise } = enrollmentBill(enrollment, bill);
  const d = resolveDiscount(grossInPaise, params.discount);

  const [updated] = await db
    .update(planEnrollment)
    .set({
      discountInPaise: d.discountInPaise,
      discountPercent: d.discountPercent,
      discountReason: d.discountInPaise ? params.discount?.reason?.trim() || null : null,
      priceInPaise: grossInPaise - d.discountInPaise,
      updatedAt: new Date(),
    })
    .where(eq(planEnrollment.id, enrollment.id))
    .returning();
  return updated!;
}

export interface ActivateEnrollmentParams {
  enrollmentId: string;
  startDate: string;
  mode?: string;
  actorId?: string | null;
  /**
   * Start the course without the advance in.
   *
   * Exists because a clinic sometimes has a reason, and a rule with no way
   * round it gets worked around by entering a payment that never happened —
   * which is worse, because then the ledger lies. Callers pass it deliberately.
   */
  overrideAdvance?: boolean;
}

/**
 * Turn a prescription into a running course: lay out the sittings, and make
 * them a patient.
 *
 * The advance is the floor, not the full price. A patient who has put 30% down
 * on a 42-day course is entitled to start, and holding them until the balance
 * cleared would be the system inventing a policy the clinic does not have.
 * Below the advance, nothing starts.
 */
export async function activateEnrollment(
  db: Database,
  params: ActivateEnrollmentParams,
): Promise<EnrollResult> {
  const [enrollment] = await db
    .select()
    .from(planEnrollment)
    .where(eq(planEnrollment.id, params.enrollmentId))
    .limit(1);
  if (!enrollment) throw new Error("That prescription no longer exists.");
  if (enrollment.status !== EnrollmentStatus.PRESCRIBED) {
    throw new Error("That course has already started.");
  }
  if (!DATE_ONLY.test(params.startDate)) throw new Error("Pick a start date.");

  const bill = await db
    .select()
    .from(planEnrollmentItem)
    .where(eq(planEnrollmentItem.enrollmentId, enrollment.id));

  // The advance is a share of the package after its discount. Extras dispensed
  // later are owed but are not part of the commitment that lets the course begin.
  const { packageInPaise } = enrollmentBill(enrollment, bill);

  const paidRows = await db
    .select()
    .from(payment)
    .where(
      and(eq(payment.enrollmentId, enrollment.id), eq(payment.kind, PaymentKind.TREATMENT_PLAN)),
    );

  const balance = planBalance(packageInPaise, enrollment.advancePercent, paidRows);
  if (!balance.advanceMet && !params.overrideAdvance) {
    const short = Math.round(balance.advanceShortfallInPaise / 100).toLocaleString("en-IN");
    throw new Error(
      `This plan needs ${enrollment.advancePercent}% in advance before it can start — ₹${short} still to collect.`,
    );
  }

  return db.transaction(async (tx) => {
    await tx
      .update(planEnrollment)
      .set({
        status: EnrollmentStatus.ACTIVE,
        startDate: params.startDate,
        activatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(planEnrollment.id, enrollment.id));

    // Started, with nothing written ahead: each sitting is logged on the day
    // the patient comes — see logSittingVisit.

    const [moved] = await tx
      .update(contact)
      .set({ stage: "PATIENT", updatedAt: new Date() })
      .where(
        and(
          eq(contact.id, enrollment.contactId),
          inArray(contact.stage, ["LEAD", "BOOKED", "INACTIVE", "LOST"]),
        ),
      )
      .returning();

    await emitDomainEvent(
      tx,
      DomainEventType.PLAN_ENROLLED,
      {
        enrollmentId: enrollment.id,
        planName: enrollment.planName,
        limbs: enrollment.limbs,
        sittings: enrollment.sittings,
        startDate: params.startDate,
      },
      { contactId: enrollment.contactId },
    );

    if (moved) {
      await emitDomainEvent(
        tx,
        DomainEventType.CONTACT_STAGE_CHANGED,
        { contactId: enrollment.contactId, stage: "PATIENT" },
        { contactId: enrollment.contactId },
      );
    }

    return {
      enrollmentId: enrollment.id,
      sittings: enrollment.sittings,
      stageChangedTo: moved ? "PATIENT" : null,
    };
  });
}

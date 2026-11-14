// Therapy bought one session at a time.
//
// Long-standing patients who stopped taking consultations turn up when they
// feel like it, pay for that day's therapy, and leave. Not a course: one
// session, or three, with weeks in between. It was a paper log sheet and
// nothing else — the therapy went unrecorded, the medicine it used never came
// off the shelf, and no receipt was ever issued.
//
// Recorded as an enrolment, because everything that has to happen already
// hangs off one: plan_sitting IS the log sheet, stock consumption reads the
// enrolment's medicine lines, and a payment settles an enrolment. A second way
// of recording a therapy day would have to reimplement all three, and the two
// would disagree inside a month.
//
// The difference is that it is open-ended. Nothing is scheduled ahead; the
// session is written on the day it happens and the enrolment's count and price
// grow with it. An enrolment whose totals track what actually happened is
// always paid up and never owes for days nobody has had — so billing,
// progress and receipts keep working with no special case.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq } from "drizzle-orm";
import {
  contact,
  planEnrollment,
  planEnrollmentItem,
  planSitting,
  treatmentPlan,
  treatmentPlanItem,
} from "./schema";
import type * as schema from "./schema";
import { EnrollmentStatus, SittingMode, SittingStatus, isSittingMode } from "./treatment-plan";
import { logSitting } from "./enrollment-service";
import { recordPayment } from "./payment-service";
import { PaymentKind } from "./payment";
import { clinicDate } from "./availability-service";
import { ensurePatientRecord } from "./patient-registry";

type Database = NodePgDatabase<typeof schema>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface WalkInSessionParams {
  contactId: string;
  /** The clinic they walked into — a new enrolment is that clinic's. */
  clinicId: string | null;
  /** A plan with isPerSession set — see the seeded single-session plans. */
  treatmentPlanId: string;
  /** The day the therapy happened. Defaults to today; can be back-dated. */
  date?: string;
  /** in_clinic | at_home. */
  mode?: string;
  /** What was charged, if it differs from the plan's rate. */
  amountInPaise?: number | null;
  method?: string;
  reference?: string | null;
  note?: string | null;
  actorId?: string | null;
}

export interface WalkInSessionResult {
  /** Their patient id — created on the first session if they had none. */
  patientCode: string | null;
  enrollmentId: string;
  sittingId: string;
  paymentId: string;
  receiptNo: string | null;
  /** Which session this was for them — 1st, 2nd, 14th. */
  sessionNumber: number;
  amountInPaise: number;
}

/**
 * Record one walk-in therapy session: the day, the money, and the stock.
 *
 * Reuses the patient's existing open-ended enrolment on this plan when there
 * is one, so "how many sessions has Ramesh had" is a question with an answer
 * rather than a pile of one-session courses.
 *
 * The sitting is written as pending and then logged done through the ordinary
 * path, not inserted as done. That path is what draws the medicine off the
 * shelf; inserting the finished row directly would record the therapy and
 * quietly skip the stock.
 */
export async function recordWalkInSession(
  db: Database,
  params: WalkInSessionParams,
): Promise<WalkInSessionResult> {
  const date = params.date ?? clinicDate(0);
  if (!DATE_ONLY.test(date)) throw new Error("Pick the date the therapy happened.");
  if (date > clinicDate(0)) throw new Error("That date is in the future — pick the day the therapy happened.");

  const mode = params.mode ?? SittingMode.IN_CLINIC;
  if (!isSittingMode(mode)) throw new Error("Pick in clinic or at home.");

  const [plan] = await db
    .select()
    .from(treatmentPlan)
    .where(eq(treatmentPlan.id, params.treatmentPlanId))
    .limit(1);

  if (!plan) throw new Error("That plan no longer exists.");
  if (!plan.isPerSession) {
    throw new Error(`"${plan.name}" is a course, not a single session.`);
  }

  const amountInPaise = params.amountInPaise ?? plan.priceInPaise;
  if (!Number.isInteger(amountInPaise) || amountInPaise < 0) {
    throw new Error("Enter what was charged for this session.");
  }

  // One open-ended enrolment per patient per plan. A second would split their
  // history in half for no reason anybody could explain later.
  const [existing] = await db
    .select()
    .from(planEnrollment)
    .where(
      and(
        eq(planEnrollment.contactId, params.contactId),
        eq(planEnrollment.treatmentPlanId, plan.id),
        eq(planEnrollment.isPerSession, true),
        eq(planEnrollment.status, EnrollmentStatus.ACTIVE),
      ),
    )
    .orderBy(desc(planEnrollment.createdAt))
    .limit(1);

  let enrollment = existing;

  if (!enrollment) {
    const [created] = await db
      .insert(planEnrollment)
      .values({
        clinicId: params.clinicId,
        contactId: params.contactId,
        treatmentPlanId: plan.id,
        planName: plan.name,
        limbs: plan.limbs,
        durationDays: 0,
        // Both start at zero and grow with what actually happens. A count set
        // up front would be a promise about visits nobody has agreed to.
        sittings: 0,
        priceInPaise: 0,
        advancePercent: 0,
        isPerSession: true,
        startDate: date,
        status: EnrollmentStatus.ACTIVE,
        activatedAt: new Date(),
      })
      .returning();

    enrollment = created!;

    // The medicine lines come across so consumption knows what a session
    // draws on. They are priced at zero: the session rate covers them.
    const lines = await db
      .select()
      .from(treatmentPlanItem)
      .where(eq(treatmentPlanItem.planId, plan.id));

    if (lines.length) {
      await db.insert(planEnrollmentItem).values(
        lines.map((line) => ({
          enrollmentId: enrollment!.id,
          kind: line.kind,
          medicineId: line.medicineId,
          name: line.name,
          quantity: line.quantity,
          rateInPaise: line.rateInPaise,
          sortOrder: line.sortOrder,
        })),
      );
    }

    // A walk-in taking therapy is a patient, whatever they were before.
    await db
      .update(contact)
      .set({ stage: "PATIENT", updatedAt: new Date() })
      .where(and(eq(contact.id, params.contactId), eq(contact.stage, "LEAD")));
  }

  // A walk-in taking therapy is a patient, and a patient has a chart and an
  // id. Without one they have therapy days, payments and receipts and nothing
  // to file any of it under — and the desk cannot quote them a patient id.
  const chart = await ensurePatientRecord(db, params.contactId);

  const sessionNumber = enrollment.sittings + 1;

  const [sitting] = await db
    .insert(planSitting)
    .values({
      enrollmentId: enrollment.id,
      contactId: params.contactId,
      dayNumber: sessionNumber,
      plannedDate: date,
      mode,
      status: SittingStatus.PENDING,
    })
    .returning();

  // Through the ordinary path, so the medicine comes off the shelf.
  await logSitting(db, {
    sittingId: sitting!.id,
    status: SittingStatus.DONE,
    note: params.note ?? null,
    source: "staff",
    actorId: params.actorId ?? null,
    // The clinic they walked into, even on an enrolment opened at another.
    clinicId: params.clinicId,
  });

  // The enrolment's totals follow what happened, which is what keeps it paid
  // up: price grows by exactly what was charged, so nothing is ever owed for a
  // session that has not been had.
  await db
    .update(planEnrollment)
    .set({
      sittings: sessionNumber,
      priceInPaise: enrollment.priceInPaise + amountInPaise,
      updatedAt: new Date(),
    })
    .where(eq(planEnrollment.id, enrollment.id));

  const payment = await recordPayment(db, {
    contactId: params.contactId,
    kind: PaymentKind.TREATMENT_PLAN,
    enrollmentId: enrollment.id,
    amountInPaise,
    method: params.method ?? "cash",
    reference: params.reference ?? null,
    note: `Walk-in therapy · session ${sessionNumber}`,
    actorId: params.actorId ?? null,
    clinicId: params.clinicId,
  });

  return {
    patientCode: chart?.patientCode ?? null,
    enrollmentId: enrollment.id,
    sittingId: sitting!.id,
    paymentId: payment.id,
    receiptNo: payment.receiptNo ?? null,
    sessionNumber,
    amountInPaise,
  };
}

/** The single-session plans, for the walk-in picker. */
export async function perSessionPlans(db: Database) {
  return db
    .select()
    .from(treatmentPlan)
    .where(and(eq(treatmentPlan.isPerSession, true), eq(treatmentPlan.isActive, true)))
    .orderBy(treatmentPlan.sortOrder, treatmentPlan.name);
}

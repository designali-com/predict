import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, inArray, ne } from "drizzle-orm";
import { clinicalFormSubmission, planEnrollment, planEnrollmentItem, payment } from "./schema";
import type * as schema from "./schema";
import {
  DOCTOR_FORM_KEYS,
  FRONT_DESK_FORM_KEY,
  NUTRITION_FORM_KEY,
  readyFormKeys,
} from "./clinical-forms";
import { consultationBalances } from "./payment-service";
import { enrollmentBill } from "./treatment-plan";
import { advanceDueInPaise, PaymentKind, totalPaid } from "./payment";
import { visitStage, visibleToClinicians, type VisitFacts, type VisitStage } from "./visit-workflow";

type Database = NodePgDatabase<typeof schema>;

/**
 * Reading a visit's position in the workflow off the rows underneath it.
 *
 * Nothing here is stored. See ./visit-workflow.ts for why: a status column
 * would be a second place the truth lives, and the first voided payment or
 * reopened form would put the two out of step with no way to tell which was
 * right.
 */

export interface VisitState {
  appointmentId: string;
  contactId: string;
  stage: VisitStage;
  facts: VisitFacts;
  /** The clinical panel may show this visit at all. */
  visibleToClinicians: boolean;
  /** Forms outstanding, in the order they are meant to be filled. */
  pendingFormKeys: string[];
  /** The course prescribed at this visit, if any. */
  enrollmentId: string | null;
}

interface VisitRow {
  id: string;
  contactId: string;
}

/**
 * The state of many visits at once.
 *
 * Batched rather than per-row because every appointment list needs it — a query
 * per row would turn one screen into fifty round trips, and the fee gate has to
 * be applied to the whole list before it is rendered.
 */
export async function visitStates(db: Database, visits: VisitRow[]): Promise<Map<string, VisitState>> {
  if (!visits.length) return new Map();

  const appointmentIds = visits.map((v) => v.id);

  const submissions = await db
    .select({
      appointmentId: clinicalFormSubmission.appointmentId,
      formKey: clinicalFormSubmission.formKey,
      status: clinicalFormSubmission.status,
    })
    .from(clinicalFormSubmission)
    .where(
      and(
        inArray(clinicalFormSubmission.appointmentId, appointmentIds),
        eq(clinicalFormSubmission.status, "submitted"),
      ),
    );

  const fees = await consultationBalances(db, appointmentIds);

  // A prescription made at this visit. Cancelled courses are ignored: a plan
  // the patient turned down should put the visit back to "assessed", not leave
  // it looking as though treatment is under way.
  const enrollments = await db
    .select()
    .from(planEnrollment)
    .where(
      and(
        inArray(planEnrollment.prescribedAtAppointmentId, appointmentIds),
        ne(planEnrollment.status, "cancelled"),
      ),
    );

  const enrollmentIds = enrollments.map((e) => e.id);

  const items = enrollmentIds.length
    ? await db
        .select()
        .from(planEnrollmentItem)
        .where(inArray(planEnrollmentItem.enrollmentId, enrollmentIds))
    : [];

  const payments = enrollmentIds.length
    ? await db
        .select()
        .from(payment)
        .where(
          and(
            inArray(payment.enrollmentId, enrollmentIds),
            eq(payment.kind, PaymentKind.TREATMENT_PLAN),
          ),
        )
    : [];

  // Only forms that actually have questions count towards "the doctor is
  // done". An unwritten form would otherwise hold every patient at the doctor
  // for ever, which is a worse failure than not having the form.
  const doctorKeys = readyFormKeys(DOCTOR_FORM_KEYS);
  const frontDeskReady = readyFormKeys([FRONT_DESK_FORM_KEY]).length > 0;
  const nutritionReady = readyFormKeys([NUTRITION_FORM_KEY]).length > 0;

  const out = new Map<string, VisitState>();

  for (const visit of visits) {
    const done = new Set(
      submissions.filter((s) => s.appointmentId === visit.id).map((s) => s.formKey),
    );

    const enrollment = enrollments.find((e) => e.prescribedAtAppointmentId === visit.id) ?? null;

    let advancePaid = false;
    if (enrollment) {
      const bill = items.filter((i) => i.enrollmentId === enrollment.id);
      // The advance is a share of the discounted package, not of extras dispensed later.
      const { packageInPaise } = enrollmentBill(enrollment, bill);
      const due = advanceDueInPaise(packageInPaise, enrollment.advancePercent);
      const paid = totalPaid(payments.filter((p) => p.enrollmentId === enrollment.id));
      // A plan with no advance required is met the moment it is prescribed —
      // otherwise a clinic that takes nothing up front could never start one.
      advancePaid = paid >= due;
    }

    const facts: VisitFacts = {
      registrationDone: !frontDeskReady || done.has(FRONT_DESK_FORM_KEY),
      feePaid: fees.get(visit.id)?.settled ?? false,
      doctorFormsDone: doctorKeys.length > 0 && doctorKeys.every((k) => done.has(k)),
      planPrescribed: Boolean(enrollment),
      nutritionDone: !nutritionReady || done.has(NUTRITION_FORM_KEY),
      advancePaid,
    };

    const pendingFormKeys = [
      ...(frontDeskReady && !done.has(FRONT_DESK_FORM_KEY) ? [FRONT_DESK_FORM_KEY] : []),
      ...doctorKeys.filter((k) => !done.has(k)),
      ...(nutritionReady && !done.has(NUTRITION_FORM_KEY) ? [NUTRITION_FORM_KEY] : []),
    ];

    out.set(visit.id, {
      appointmentId: visit.id,
      contactId: visit.contactId,
      stage: visitStage(facts),
      facts,
      visibleToClinicians: visibleToClinicians(facts),
      pendingFormKeys,
      enrollmentId: enrollment?.id ?? null,
    });
  }

  return out;
}

export async function visitState(db: Database, visit: VisitRow): Promise<VisitState> {
  const states = await visitStates(db, [visit]);
  return states.get(visit.id)!;
}

/**
 * The gate, applied to a list.
 *
 * Clinical screens call this instead of filtering in a template. A hidden row
 * is not an access control — a doctor who types the appointment URL has to get
 * the same answer as one who reads the list, and both go through here.
 */
export async function clinicallyVisible<T extends VisitRow>(
  db: Database,
  visits: T[],
): Promise<T[]> {
  const states = await visitStates(db, visits);
  return visits.filter((v) => states.get(v.id)?.visibleToClinicians);
}

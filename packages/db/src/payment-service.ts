import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { appointment, contact, payment, planEnrollment } from "./schema";
import type * as schema from "./schema";
import { emitDomainEvent } from "./emit-domain-event";
import { DomainEventType } from "./domain-events";
import {
  balanceOf,
  consultationDue,
  isFeeWaived,
  isPaymentKind,
  isPaymentMethod,
  PaymentKind,
  planBalance,
  type Balance,
  type PlanBalance,
} from "./payment";
import { nextReceiptNo, paymentInClinic } from "./receipt";
import { markArrived } from "./arrival";

type Database = NodePgDatabase<typeof schema>;

/**
 * Recording money and answering "what is outstanding".
 *
 * Shared because both consoles ask: the front desk takes the payment in one and
 * the clinical panel has to know whether the fee cleared in the other. Two
 * implementations of "is this settled" is how a patient ends up visible to a
 * doctor on one screen and blocked on the next.
 */

export interface RecordPaymentParams {
  contactId: string;
  kind: string;
  appointmentId?: string | null;
  enrollmentId?: string | null;
  bloodTestOrderId?: string | null;
  /** The medicine bill this pays, for kind medicine. */
  medicineSaleId?: string | null;
  amountInPaise: number;
  method?: string;
  reference?: string | null;
  note?: string | null;
  actorId?: string | null;
  /**
   * The clinic taking the money — the one the desk is acting in. Its book
   * numbers the receipt. Left out only by paths with no clinic in hand, which
   * fall back to the patient's.
   */
  clinicId?: string | null;
}

export async function recordPayment(db: Database, params: RecordPaymentParams) {
  if (!Number.isInteger(params.amountInPaise) || params.amountInPaise <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }
  const method = isPaymentMethod(params.method) ? params.method : "cash";
  // The kind decides which balance the money settles, so it has to be a real
  // one and match what it is paid against — a "consultation" paid against a
  // course would show as collected and settle nothing.
  if (!isPaymentKind(params.kind)) throw new Error("Say what the payment is for.");
  const wants: Record<string, string | null | undefined> = {
    [PaymentKind.CONSULTATION]: params.appointmentId,
    [PaymentKind.TREATMENT_PLAN]: params.enrollmentId,
    [PaymentKind.BLOOD_TEST]: params.bloodTestOrderId,
  };
  if (params.kind in wants && !wants[params.kind]) {
    throw new Error(
      params.kind === PaymentKind.CONSULTATION
        ? "A consultation fee is paid against its appointment."
        : params.kind === PaymentKind.TREATMENT_PLAN
          ? "A plan payment is paid against its course."
          : "A blood test is paid against its order.",
    );
  }

  // Exactly one target. A row against neither is money nobody can reconcile;
  // a row against more than one would be counted twice by two different
  // balances.
  //
  // Medicine is the exception to "neither": plenty of people walk in only to
  // buy it, with no visit to bill it to. It settles no balance, so nothing has
  // to reconcile it — the sale is the patient's, and the receipt says what.
  const targets = [params.appointmentId, params.enrollmentId, params.bloodTestOrderId].filter(
    Boolean,
  );
  const counterSale = params.kind === PaymentKind.MEDICINE && targets.length === 0;
  if (targets.length !== 1 && !counterSale) {
    throw new Error(
      "A payment settles one thing: a consultation, a treatment plan, or a blood test.",
    );
  }

  // Issued before the insert so a payment is never stored without one. A row
  // with no receipt number is money nobody can look up by the slip the
  // patient is holding.
  // The clinic the money was taken at, which numbers it in its own receipt
  // book. Said by the caller: the desk that took the money is the one whose
  // book it goes in, and an unplaced patient has no clinic to derive. Only a
  // caller with no clinic in hand falls back to the patient's.
  let clinicId = params.clinicId ?? null;
  if (!clinicId) {
    const [owner] = await db.select({ clinicId: contact.clinicId }).from(contact).where(eq(contact.id, params.contactId)).limit(1);
    clinicId = owner?.clinicId ?? null;
  }
  const collectedAt = new Date();
  const receiptNo = await nextReceiptNo(db, collectedAt, clinicId);

  const [created] = await db
    .insert(payment)
    .values({
      clinicId,
      contactId: params.contactId,
      kind: params.kind,
      appointmentId: params.appointmentId ?? null,
      enrollmentId: params.enrollmentId ?? null,
      bloodTestOrderId: params.bloodTestOrderId ?? null,
      medicineSaleId: params.kind === PaymentKind.MEDICINE ? (params.medicineSaleId ?? null) : null,
      amountInPaise: params.amountInPaise,
      method,
      reference: params.reference?.trim() || null,
      note: params.note?.trim() || null,
      collectedByUserId: params.actorId ?? null,
      receiptNo,
      collectedAt,
    })
    .returning();

  await emitDomainEvent(
    db,
    DomainEventType.PAYMENT_SUCCESS,
    {
      paymentId: created!.id,
      kind: params.kind,
      amountInPaise: params.amountInPaise,
      appointmentId: params.appointmentId ?? null,
      enrollmentId: params.enrollmentId ?? null,
      bloodTestOrderId: params.bloodTestOrderId ?? null,
    },
    { contactId: params.contactId },
  );

  // Somebody handed money over a counter, so somebody was at the counter.
  await markArrived(db, params.appointmentId, collectedAt);

  return created!;
}

/**
 * Cancel a payment without erasing it.
 *
 * Deleting would leave a patient's ledger silently short and the person who
 * entered it with nothing to look at. The row stays, marked, and stops counting
 * towards every balance — see totalPaid.
 *
 * With a clinic, only a payment on that clinic's books (see paymentInClinic):
 * one clinic's desk cannot cancel money another clinic banked.
 */
export async function voidPayment(
  db: Database,
  paymentId: string,
  reason: string,
  actorId?: string | null,
  scope?: { clinicId: string; unplaced?: boolean },
) {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("Say why this payment is being cancelled.");

  if (scope) {
    const [mine] = await db
      .select({ id: payment.id })
      .from(payment)
      .where(and(eq(payment.id, paymentId), paymentInClinic(scope.clinicId, scope.unplaced)))
      .limit(1);
    if (!mine) throw new Error("No such payment.");
  }

  const [updated] = await db
    .update(payment)
    .set({ voidedAt: new Date(), voidReason: trimmed })
    .where(and(eq(payment.id, paymentId), isNull(payment.voidedAt)))
    .returning();

  if (!updated) throw new Error("That payment is already cancelled.");

  await emitDomainEvent(
    db,
    DomainEventType.PAYMENT_VOIDED,
    { paymentId, reason: trimmed, amountInPaise: updated.amountInPaise, actorId: actorId ?? null },
    { contactId: updated.contactId },
  );

  return updated;
}

export async function paymentsForContact(db: Database, contactId: string) {
  return db
    .select()
    .from(payment)
    .where(eq(payment.contactId, contactId))
    .orderBy(desc(payment.collectedAt));
}

/** A visit's fee balance — nothing owed on one that was cancelled or missed. */
function visitBalance(fee: number, status: string | null | undefined, rows: Parameters<typeof balanceOf>[1]): Balance {
  const b = balanceOf(fee, rows);
  if (!isFeeWaived(status)) return b;
  return { ...balanceOf(consultationDue(fee, status, b.paidInPaise), rows), waived: true };
}

/** What this visit owes for the consultation, and whether it has cleared. */
export async function consultationBalance(
  db: Database,
  appointmentId: string,
): Promise<Balance & { appointmentId: string }> {
  const [visit] = await db
    .select({ fee: appointment.feeInPaise, status: appointment.status })
    .from(appointment)
    .where(eq(appointment.id, appointmentId))
    .limit(1);

  const rows = await db
    .select()
    .from(payment)
    .where(and(eq(payment.appointmentId, appointmentId), eq(payment.kind, PaymentKind.CONSULTATION)))
    .orderBy(asc(payment.collectedAt));

  return { appointmentId, ...visitBalance(visit?.fee ?? 0, visit?.status, rows) };
}

/** The same, for many visits at once — the appointment list needs it per row. */
export async function consultationBalances(
  db: Database,
  appointmentIds: string[],
): Promise<Map<string, Balance>> {
  if (!appointmentIds.length) return new Map();

  const visits = await db
    .select({ id: appointment.id, fee: appointment.feeInPaise, status: appointment.status })
    .from(appointment)
    .where(inArray(appointment.id, appointmentIds));

  const rows = await db
    .select()
    .from(payment)
    .where(
      and(inArray(payment.appointmentId, appointmentIds), eq(payment.kind, PaymentKind.CONSULTATION)),
    );

  return new Map(
    visits.map((v) => [v.id, visitBalance(v.fee, v.status, rows.filter((r) => r.appointmentId === v.id))]),
  );
}

/**
 * A course's balance, and separately whether the advance is met.
 *
 * `dueInPaise` is the whole bill including any extras dispensed on top of the
 * package — those were sold to this patient and are owed. The advance is a
 * percentage of what the plan itself cost, not of the extras, because the
 * advance is the commitment to the course.
 */
export async function enrollmentBalance(
  db: Database,
  enrollmentId: string,
  totalInPaise: number,
  packageInPaise: number,
): Promise<PlanBalance> {
  const [enrollment] = await db
    .select({ advancePercent: planEnrollment.advancePercent })
    .from(planEnrollment)
    .where(eq(planEnrollment.id, enrollmentId))
    .limit(1);

  const rows = await db
    .select()
    .from(payment)
    .where(
      and(eq(payment.enrollmentId, enrollmentId), eq(payment.kind, PaymentKind.TREATMENT_PLAN)),
    )
    .orderBy(asc(payment.collectedAt));

  const advancePercent = enrollment?.advancePercent ?? 0;
  const base = planBalance(packageInPaise, advancePercent, rows);

  // The advance is measured against the package; everything owed is measured
  // against the package plus extras.
  return { ...base, ...balanceOf(totalInPaise, rows), advancePercent, advanceDueInPaise: base.advanceDueInPaise, advanceMet: base.advanceMet, advanceShortfallInPaise: base.advanceShortfallInPaise };
}

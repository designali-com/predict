// Money taken at the front desk: the consultation fee, a treatment plan, or
// medicine sold on its own.
//
// Different shapes of payment, one table. The consultation fee is settled
// in one go and gates the doctor's panel. A treatment plan can be paid in
// instalments, with a floor: every plan carries an advance percentage, and the
// course does not start until at least that much is in. Medicine is a counter
// sale at a visit — it does not settle the consultation fee.
//
// Amounts are integer paise everywhere, for the same reason as the plan prices:
// a balance computed in floating point reaches a receipt as ₹24,999.99999, and
// "is this fully paid?" becomes a question about epsilon.

export const PaymentKind = {
  /** The consultation fee for one appointment. Gates the clinical panel. */
  CONSULTATION: "consultation",
  /** Against a prescribed treatment plan. May be one of several. */
  TREATMENT_PLAN: "treatment_plan",
  /** Lab work: the markers chosen for one blood draw, priced one by one. */
  BLOOD_TEST: "blood_test",
  /** Medicine sold at the counter during a visit. Does not settle the fee. */
  MEDICINE: "medicine",
} as const;

export type PaymentKind = (typeof PaymentKind)[keyof typeof PaymentKind];

export const PAYMENT_KINDS: { value: PaymentKind; label: string }[] = [
  { value: "consultation", label: "Consultation fee" },
  { value: "treatment_plan", label: "Treatment plan" },
  { value: "blood_test", label: "Blood test" },
  { value: "medicine", label: "Medicine" },
];

export const PaymentMethod = {
  CASH: "cash",
  CARD: "card",
  UPI: "upi",
  BANK: "bank",
  OTHER: "other",
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

export function isPaymentKind(v: unknown): v is PaymentKind {
  return PAYMENT_KINDS.some((k) => k.value === v);
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return PAYMENT_METHODS.some((m) => m.value === v);
}

/**
 * The clinic's standing consultation fee, in paise.
 *
 * A default, not a rule — it is copied onto the appointment when it is booked
 * and can be changed there, because concessions happen and the front desk
 * should not have to ask anyone. Changing it here changes what future bookings
 * start at and nothing else.
 *
 * The one place the figure lives: appointment.fee_in_paise defaults to this
 * (schema.ts), and the column default in the database is kept equal to it by
 * migration (drizzle/0084).
 */
export const DEFAULT_CONSULTATION_FEE_PAISE = 120_000; // ₹1,200

export interface PaymentLike {
  amountInPaise: number;
  voidedAt?: Date | string | null;
}

/**
 * What has actually been collected.
 *
 * Voided rows are excluded rather than deleted: a payment entered against the
 * wrong patient is a mistake somebody has to be able to see afterwards, and a
 * receipt that vanishes is worse than one marked cancelled.
 */
export function totalPaid(payments: PaymentLike[]): number {
  return payments.reduce((sum, p) => (p.voidedAt ? sum : sum + p.amountInPaise), 0);
}

export interface Balance {
  /** What is owed in total. */
  dueInPaise: number;
  paidInPaise: number;
  /** Never negative — an overpayment is a credit, not a negative balance. */
  outstandingInPaise: number;
  settled: boolean;
  /** The visit was cancelled or a no-show, so its fee is not charged. */
  waived?: boolean;
}

/**
 * A visit that did not happen owes nothing.
 *
 * Cancelled or a no-show: the consultation fee is not charged, so it is never
 * "due", never "to collect" and never in what is owed. Whatever was already
 * taken stays on the record as taken (a refund is a separate act) — it is
 * simply not short of anything.
 */
export const FEE_WAIVED_STATUSES = ["cancelled", "no_show"] as const;
export const isFeeWaived = (status: string | null | undefined): boolean =>
  (FEE_WAIVED_STATUSES as readonly string[]).includes(status ?? "");

/** What a visit's fee comes to, given how the visit ended. */
export function consultationDue(feeInPaise: number, status: string | null | undefined, paidInPaise: number): number {
  return isFeeWaived(status) ? Math.min(feeInPaise, paidInPaise) : feeInPaise;
}

export function balanceOf(dueInPaise: number, payments: PaymentLike[]): Balance {
  const paidInPaise = totalPaid(payments);
  return {
    dueInPaise,
    paidInPaise,
    outstandingInPaise: Math.max(0, dueInPaise - paidInPaise),
    settled: paidInPaise >= dueInPaise,
  };
}

/**
 * The minimum that has to be in before a course can start.
 *
 * Rounded UP. A 30% advance on ₹85,755 is ₹25,726.50, and rounding down would
 * let the course start one paisa short of the rule it exists to enforce.
 */
export function advanceDueInPaise(totalInPaise: number, advancePercent: number): number {
  const pct = Math.min(100, Math.max(0, advancePercent));
  return Math.ceil((totalInPaise * pct) / 100);
}

export interface PlanBalance extends Balance {
  advancePercent: number;
  advanceDueInPaise: number;
  /** Enough is in to start the sittings. */
  advanceMet: boolean;
  /** What is still needed to start — zero once the advance is met. */
  advanceShortfallInPaise: number;
}

/**
 * A treatment plan's balance, and separately whether it can start.
 *
 * Two questions, deliberately kept apart. "Is it paid off?" is what the front
 * desk chases. "Can the course begin?" is what the therapist needs, and the
 * answer to that is the advance, not the total — a patient on a 42-day course
 * with 30% down is entitled to start, and blocking them until the balance
 * cleared would be the system inventing a policy the clinic does not have.
 */
export function planBalance(
  totalInPaise: number,
  advancePercent: number,
  payments: PaymentLike[],
): PlanBalance {
  const base = balanceOf(totalInPaise, payments);
  const advance = advanceDueInPaise(totalInPaise, advancePercent);
  return {
    ...base,
    advancePercent,
    advanceDueInPaise: advance,
    advanceMet: base.paidInPaise >= advance,
    advanceShortfallInPaise: Math.max(0, advance - base.paidInPaise),
  };
}

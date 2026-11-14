// What the clinic actually took, over a period.
//
// The billing page already answers "who owes us". It could not answer the
// question the desk is asked every evening — how much came in, in what form,
// and who took it — which is the one you need to count the drawer against.
//
// Every figure here is a sum of payment rows. Nothing is stored as a total,
// because a stored total and a ledger disagree the first time one write is
// missed, and the disagreement is silent until somebody counts the cash.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { appointment, contact, payment, user } from "./schema";
import type * as schema from "./schema";
import { PAYMENT_KINDS, PAYMENT_METHODS } from "./payment";
import { CLINIC_UTC_OFFSET, clinicDate } from "./availability-service";

type Database = NodePgDatabase<typeof schema>;

function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00${CLINIC_UTC_OFFSET}`);
}

function dayEnd(date: string): Date {
  const d = dayStart(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export interface Split {
  key: string;
  label: string;
  amountInPaise: number;
  count: number;
}

export interface RecentReceipt {
  paymentId: string;
  receiptNo: string | null;
  name: string | null;
  amountInPaise: number;
  method: string;
  kind: string;
  collectedAt: Date;
  voidedAt: Date | null;
  collectedBy: string | null;
}

export interface BillingReport {
  from: string;
  to: string;
  days: number;
  totals: {
    collectedInPaise: number;
    receipts: number;
    /** Distinct patients who paid something. */
    patients: number;
    /** Cancelled inside the period — money that came in and went back out. */
    voidedInPaise: number;
    voidedCount: number;
    /** collectedInPaise ÷ receipts, so a busy day of small fees reads apart
     *  from a quiet day with one course sold. */
    averageInPaise: number;
  };
  byMethod: Split[];
  byKind: Split[];
  /** Who took the money. What a shift is reconciled against. */
  byCollector: Split[];
  daily: { date: string; amountInPaise: number; count: number }[];
  /** Still owed on visits inside the period, summed per visit. */
  unpaidConsultationInPaise: number;
  /** How many visits are short — not how many there were. */
  unpaidConsultationCount: number;
  recent: RecentReceipt[];
}

/**
 * Collections for a period, broken down every way the desk is asked for.
 *
 * Voided payments are excluded from every total and reported separately. A
 * cancelled payment is not a smaller payment — it is one that should never
 * have been counted — but it still happened, and a day where three were
 * cancelled is a day somebody should look at.
 */
export async function billingReport(
  db: Database,
  params: { from?: string; to?: string; clinicId?: string } = {},
): Promise<BillingReport> {
  const to = params.to ?? clinicDate(0);
  const from = params.from ?? clinicDate(-29, new Date(`${to}T00:00:00Z`));
  const days = Math.max(
    1,
    Math.round((dayStart(to).getTime() - dayStart(from).getTime()) / 86_400_000) + 1,
  );

  // This clinic's money only — the same scope as the Payments tab, so the two
  // never show different "Collected" figures.
  const window = and(
    gte(payment.collectedAt, dayStart(from)),
    lt(payment.collectedAt, dayEnd(to)),
    ...(params.clinicId ? [eq(contact.clinicId, params.clinicId)] : []),
  );

  const rows = await db
    .select({
      id: payment.id,
      contactId: payment.contactId,
      amountInPaise: payment.amountInPaise,
      method: payment.method,
      kind: payment.kind,
      collectedAt: payment.collectedAt,
      voidedAt: payment.voidedAt,
      collectedByUserId: payment.collectedByUserId,
      collectorName: user.name,
      name: contact.name,
      receiptNo: payment.receiptNo,
    })
    .from(payment)
    .innerJoin(contact, eq(contact.id, payment.contactId))
    .leftJoin(user, eq(user.id, payment.collectedByUserId))
    .where(window)
    .orderBy(desc(payment.collectedAt));

  const good = rows.filter((r) => !r.voidedAt);
  const voided = rows.filter((r) => r.voidedAt);

  const collectedInPaise = good.reduce((n, r) => n + r.amountInPaise, 0);

  const split = (
    of: typeof good,
    keyOf: (r: (typeof good)[number]) => string,
    labelOf: (key: string, r: (typeof good)[number]) => string,
  ): Split[] => {
    const map = new Map<string, Split>();
    for (const row of of) {
      const key = keyOf(row);
      const found = map.get(key) ?? { key, label: labelOf(key, row), amountInPaise: 0, count: 0 };
      found.amountInPaise += row.amountInPaise;
      found.count += 1;
      map.set(key, found);
    }
    return [...map.values()].sort((a, b) => b.amountInPaise - a.amountInPaise);
  };

  // Per clinic day, so a payment taken at 9pm belongs to the day the clinic
  // was open rather than to tomorrow.
  const buckets = new Map<string, { amountInPaise: number; count: number }>();
  for (const row of good) {
    const date = clinicDate(0, row.collectedAt);
    const found = buckets.get(date) ?? { amountInPaise: 0, count: 0 };
    found.amountInPaise += row.amountInPaise;
    found.count += 1;
    buckets.set(date, found);
  }

  const daily: BillingReport["daily"] = [];
  for (let i = 0; i < days; i++) {
    const date = clinicDate(i, new Date(`${from}T00:00:00Z`));
    const found = buckets.get(date);
    daily.push({ date, amountInPaise: found?.amountInPaise ?? 0, count: found?.count ?? 0 });
  }

  // Visits inside the period that are still short, and by how much.
  //
  // Counted per visit rather than as "charged minus collected": a patient
  // paying off an older visit would otherwise cancel out an unpaid new one and
  // report the day as square when two things are wrong. Only shortfalls are
  // summed, so an overpayment on one visit cannot hide a gap on another.
  const owed = await db.execute<{ visits: number; owed: number }>(sql`
    select
      count(*)::int as visits,
      coalesce(sum(a.fee_in_paise - coalesce(p.paid, 0)), 0)::double precision as owed
    from appointment a
    left join (
      select appointment_id, sum(amount_in_paise) as paid
      from payment
      -- The fee is settled by fee money only: medicine sold at the visit is
      -- not a consultation payment.
      where voided_at is null and appointment_id is not null and kind = 'consultation'
      group by appointment_id
    ) p on p.appointment_id = a.id
    join contact c on c.id = a.contact_id
    where a.scheduled_at >= ${dayStart(from)}
      and a.scheduled_at < ${dayEnd(to)}
      and a.status not in ('cancelled', 'no_show')
      and a.fee_in_paise > coalesce(p.paid, 0)
      and (${params.clinicId ?? null}::text is null or c.clinic_id = ${params.clinicId ?? null})
  `);

  return {
    from,
    to,
    days,
    totals: {
      collectedInPaise,
      receipts: good.length,
      patients: new Set(good.map((r) => r.contactId)).size,
      voidedInPaise: voided.reduce((n, r) => n + r.amountInPaise, 0),
      voidedCount: voided.length,
      averageInPaise: good.length ? Math.round(collectedInPaise / good.length) : 0,
    },
    byMethod: split(
      good,
      (r) => r.method,
      (key) => PAYMENT_METHODS.find((m) => m.value === key)?.label ?? key,
    ),
    byKind: split(
      good,
      (r) => r.kind,
      (key) => PAYMENT_KINDS.find((k) => k.value === key)?.label ?? key,
    ),
    byCollector: split(
      good,
      (r) => r.collectedByUserId ?? "unknown",
      (key, r) => r.collectorName ?? (key === "unknown" ? "Not recorded" : key),
    ),
    daily,
    unpaidConsultationInPaise: Math.round(Number(owed.rows[0]?.owed ?? 0)),
    unpaidConsultationCount: Number(owed.rows[0]?.visits ?? 0),
    // Every receipt in the period (the screen pages them), newest first.
    recent: rows.slice(0, 2000).map((r) => ({
      paymentId: r.id,
      receiptNo: r.receiptNo,
      name: r.name,
      amountInPaise: r.amountInPaise,
      method: r.method,
      kind: r.kind,
      collectedAt: r.collectedAt,
      voidedAt: r.voidedAt,
      collectedBy: r.collectorName ?? null,
    })),
  };
}

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { bloodTestOrder, contact, payment, user } from "./schema";
import type * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

/**
 * Every payment, one list — the clinic's single record of money in.
 *
 * Consultation fees, treatment plans, blood tests and medicine all land in the
 * one payment table already; this reads it with the filters a desk or an
 * accountant asks for, plus the totals and the day-by-day series the Billing
 * page draws. A voided receipt stays in the list (struck through) but never in
 * a total.
 *
 * Scoped by the patient's clinic, as the rest of billing is: a payment row
 * does not always carry its own clinic.
 */

export interface LedgerFilter {
  clinicId: string;
  /** YYYY-MM-DD, India time, inclusive. */
  from: string;
  to: string;
  kind?: string | null;
  method?: string | null;
  q?: string | null;
}

/** The day a payment was taken, in India. */
const istDay = sql<string>`to_char(${payment.collectedAt} + interval '330 minutes', 'YYYY-MM-DD')`;

function where(f: LedgerFilter, { live = false }: { live?: boolean } = {}): SQL {
  const parts: SQL[] = [
    eq(contact.clinicId, f.clinicId),
    sql`${istDay} between ${f.from} and ${f.to}`,
  ];
  if (f.kind) parts.push(eq(payment.kind, f.kind));
  if (f.method) parts.push(eq(payment.method, f.method));
  if (live) parts.push(isNull(payment.voidedAt));
  const q = f.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    parts.push(
      or(
        ilike(contact.name, like),
        ilike(payment.receiptNo, like),
        ilike(payment.reference, like),
        ...(digits.length >= 4 ? [ilike(contact.phone, `%${digits}%`)] : []),
      )!,
    );
  }
  return and(...parts)!;
}

export interface LedgerRow {
  id: string;
  collectedAt: string;
  receiptNo: string | null;
  kind: string;
  method: string;
  reference: string | null;
  amountInPaise: number;
  voided: boolean;
  voidReason: string | null;
  contactId: string;
  patient: string | null;
  phone: string | null;
  collectedBy: string | null;
  appointmentId: string | null;
  enrollmentId: string | null;
  bloodTestOrderId: string | null;
}

export async function ledgerRows(db: Db, f: LedgerFilter, limit = 500, offset = 0): Promise<LedgerRow[]> {
  const rows = await db
    .select({
      id: payment.id,
      collectedAt: payment.collectedAt,
      receiptNo: payment.receiptNo,
      kind: payment.kind,
      method: payment.method,
      reference: payment.reference,
      amountInPaise: payment.amountInPaise,
      voidedAt: payment.voidedAt,
      voidReason: payment.voidReason,
      contactId: payment.contactId,
      patient: contact.name,
      phone: contact.phone,
      collectedBy: user.name,
      appointmentId: payment.appointmentId,
      enrollmentId: payment.enrollmentId,
      bloodTestOrderId: payment.bloodTestOrderId,
    })
    .from(payment)
    .innerJoin(contact, eq(contact.id, payment.contactId))
    .leftJoin(user, eq(user.id, payment.collectedByUserId))
    .where(where(f))
    .orderBy(desc(payment.collectedAt), desc(payment.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map((r) => ({
    id: r.id,
    collectedAt: r.collectedAt.toISOString(),
    receiptNo: r.receiptNo,
    kind: r.kind,
    method: r.method,
    reference: r.reference,
    amountInPaise: r.amountInPaise,
    voided: Boolean(r.voidedAt),
    voidReason: r.voidReason,
    contactId: r.contactId,
    patient: r.patient,
    phone: r.phone,
    collectedBy: r.collectedBy,
    appointmentId: r.appointmentId,
    enrollmentId: r.enrollmentId,
    bloodTestOrderId: r.bloodTestOrderId,
  }));
}

/** How many rows the filter matches, cancelled ones included — what the list pages over. */
export async function ledgerCount(db: Db, f: LedgerFilter): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payment)
    .innerJoin(contact, eq(contact.id, payment.contactId))
    .where(where(f));
  return row?.n ?? 0;
}

export interface LedgerSummary {
  collectedInPaise: number;
  receipts: number;
  voided: number;
  byMethod: { key: string; amountInPaise: number; count: number }[];
  byKind: { key: string; amountInPaise: number; count: number }[];
  /** Every day in the range, zero-filled, for the chart. */
  daily: { date: string; amountInPaise: number; count: number }[];
}

export async function ledgerSummary(db: Db, f: LedgerFilter): Promise<LedgerSummary> {
  const group = async (col: typeof payment.method | typeof payment.kind) =>
    db
      .select({ key: col, amountInPaise: sql<number>`coalesce(sum(${payment.amountInPaise}), 0)::int`, count: sql<number>`count(*)::int` })
      .from(payment)
      .innerJoin(contact, eq(contact.id, payment.contactId))
      .where(where(f, { live: true }))
      .groupBy(col);

  const [byMethod, byKind, daily, voided] = await Promise.all([
    group(payment.method),
    group(payment.kind),
    db
      .select({ date: istDay, amountInPaise: sql<number>`coalesce(sum(${payment.amountInPaise}), 0)::int`, count: sql<number>`count(*)::int` })
      .from(payment)
      .innerJoin(contact, eq(contact.id, payment.contactId))
      .where(where(f, { live: true }))
      .groupBy(istDay),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(payment)
      .innerJoin(contact, eq(contact.id, payment.contactId))
      .where(and(where(f), sql`${payment.voidedAt} is not null`)),
  ]);

  const byDay = new Map(daily.map((d) => [d.date, d]));
  const days: LedgerSummary["daily"] = [];
  for (let d = f.from; d <= f.to && days.length < 400; d = nextDay(d)) {
    const hit = byDay.get(d);
    days.push({ date: d, amountInPaise: hit?.amountInPaise ?? 0, count: hit?.count ?? 0 });
  }

  const sortDesc = <T extends { amountInPaise: number }>(rows: T[]) => [...rows].sort((a, b) => b.amountInPaise - a.amountInPaise);
  return {
    collectedInPaise: byMethod.reduce((n, r) => n + r.amountInPaise, 0),
    receipts: byMethod.reduce((n, r) => n + r.count, 0),
    voided: voided[0]?.n ?? 0,
    byMethod: sortDesc(byMethod),
    byKind: sortDesc(byKind),
    daily: days,
  };
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Blood tests still owed on — for the Dues list beside fees and plans. */
export async function bloodTestDues(db: Db, clinicId: string) {
  const rows = await db
    .select({
      orderId: bloodTestOrder.id,
      contactId: contact.id,
      patientId: bloodTestOrder.patientId,
      name: contact.name,
      phone: contact.phone,
      orderedOn: bloodTestOrder.orderedOn,
      status: bloodTestOrder.status,
      totalInPaise: bloodTestOrder.totalInPaise,
      paidInPaise: sql<number>`coalesce((
        select sum(p.amount_in_paise) from payment p
        where p.blood_test_order_id = ${bloodTestOrder.id} and p.voided_at is null
      ), 0)::int`,
    })
    .from(bloodTestOrder)
    .innerJoin(contact, eq(contact.id, bloodTestOrder.contactId))
    .where(and(eq(contact.clinicId, clinicId), sql`${bloodTestOrder.status} <> 'cancelled'`, sql`${bloodTestOrder.totalInPaise} > 0`))
    .orderBy(desc(bloodTestOrder.createdAt))
    .limit(300);
  return rows
    .map((r) => ({ ...r, outstandingInPaise: Math.max(0, r.totalInPaise - r.paidInPaise) }))
    .filter((r) => r.outstandingInPaise > 0);
}

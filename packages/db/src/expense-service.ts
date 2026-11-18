import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { cashDeposit, contact, expense, expenseRecurring, payment, user } from "./schema";
import type * as schema from "./schema";
import { isCashDepositVia, isExpenseCategory } from "./expense";
import { isPaymentMethod } from "./payment";

type Db = NodePgDatabase<typeof schema>;

/**
 * Money out. The other half of Billing: payments say what came in, this says
 * what went, and the two together are the month's margin.
 *
 * Kept like the payment ledger on purpose — dates are India days, a voided row
 * stays in the list (struck through) and never in a total, and everything is
 * scoped to one clinic.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** India today, as YYYY-MM-DD. */
export function indiaToday(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

export interface ExpenseFilter {
  clinicId: string;
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
  category?: string | null;
  method?: string | null;
  q?: string | null;
  /** Only what this person entered — the desk's view. */
  createdBy?: string | null;
}

function where(f: ExpenseFilter, { live = false }: { live?: boolean } = {}): SQL {
  const parts: SQL[] = [
    eq(expense.clinicId, f.clinicId),
    sql`${expense.spentOn} between ${f.from} and ${f.to}`,
  ];
  if (f.category) parts.push(eq(expense.category, f.category));
  if (f.method) parts.push(eq(expense.method, f.method));
  if (f.createdBy) parts.push(eq(expense.createdByUserId, f.createdBy));
  if (live) parts.push(isNull(expense.voidedAt));
  const q = f.q?.trim();
  if (q) {
    const like = `%${q}%`;
    parts.push(or(ilike(expense.paidTo, like), ilike(expense.note, like), ilike(expense.reference, like))!);
  }
  return and(...parts)!;
}

export interface ExpenseRow {
  id: string;
  spentOn: string;
  category: string;
  amountInPaise: number;
  method: string;
  paidTo: string | null;
  reference: string | null;
  note: string | null;
  billUrl: string | null;
  billName: string | null;
  recurring: boolean;
  voided: boolean;
  voidReason: string | null;
  enteredBy: string | null;
  createdAt: string;
}

export async function listExpenses(db: Db, f: ExpenseFilter, limit = 500, offset = 0): Promise<ExpenseRow[]> {
  const rows = await db
    .select({
      id: expense.id,
      spentOn: expense.spentOn,
      category: expense.category,
      amountInPaise: expense.amountInPaise,
      method: expense.method,
      paidTo: expense.paidTo,
      reference: expense.reference,
      note: expense.note,
      billUrl: expense.billUrl,
      billName: expense.billName,
      recurringId: expense.recurringId,
      voidedAt: expense.voidedAt,
      voidReason: expense.voidReason,
      enteredBy: user.name,
      createdAt: expense.createdAt,
    })
    .from(expense)
    .leftJoin(user, eq(user.id, expense.createdByUserId))
    .where(where(f))
    .orderBy(desc(expense.spentOn), desc(expense.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map((r) => ({
    id: r.id,
    spentOn: r.spentOn,
    category: r.category,
    amountInPaise: r.amountInPaise,
    method: r.method,
    paidTo: r.paidTo,
    reference: r.reference,
    note: r.note,
    billUrl: r.billUrl,
    billName: r.billName,
    recurring: Boolean(r.recurringId),
    voided: Boolean(r.voidedAt),
    voidReason: r.voidReason,
    enteredBy: r.enteredBy,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** How many expenses the filter matches, cancelled ones included — what the list pages over. */
export async function countExpenses(db: Db, f: ExpenseFilter): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(expense).where(where(f));
  return row?.n ?? 0;
}

export interface Split {
  key: string;
  amountInPaise: number;
  count: number;
}

export interface ExpenseSummary {
  spentInPaise: number;
  entries: number;
  voided: number;
  byCategory: Split[];
  byMethod: Split[];
  /** Every day in the range, zero-filled. */
  daily: { date: string; amountInPaise: number; count: number }[];
}

export async function expenseSummary(db: Db, f: ExpenseFilter): Promise<ExpenseSummary> {
  const total = sql<number>`coalesce(sum(${expense.amountInPaise}), 0)::int`;
  const n = sql<number>`count(*)::int`;
  const day = sql<string>`to_char(${expense.spentOn}, 'YYYY-MM-DD')`;
  const [byCategory, byMethod, daily, voided] = await Promise.all([
    db.select({ key: expense.category, amountInPaise: total, count: n }).from(expense).where(where(f, { live: true })).groupBy(expense.category),
    db.select({ key: expense.method, amountInPaise: total, count: n }).from(expense).where(where(f, { live: true })).groupBy(expense.method),
    db.select({ date: day, amountInPaise: total, count: n }).from(expense).where(where(f, { live: true })).groupBy(day),
    db.select({ n }).from(expense).where(and(where(f), sql`${expense.voidedAt} is not null`)),
  ]);

  const byDay = new Map(daily.map((d) => [d.date, d]));
  const days: ExpenseSummary["daily"] = [];
  for (let d = f.from; d <= f.to && days.length < 400; d = nextDay(d)) {
    const hit = byDay.get(d);
    days.push({ date: d, amountInPaise: hit?.amountInPaise ?? 0, count: hit?.count ?? 0 });
  }
  const sortDesc = (rows: Split[]) => [...rows].sort((a, b) => b.amountInPaise - a.amountInPaise);
  return {
    spentInPaise: byCategory.reduce((s, r) => s + r.amountInPaise, 0),
    entries: byCategory.reduce((s, r) => s + r.count, 0),
    voided: voided[0]?.n ?? 0,
    byCategory: sortDesc(byCategory),
    byMethod: sortDesc(byMethod),
    daily: days,
  };
}

export interface AddExpenseParams {
  clinicId: string;
  spentOn: string;
  category: string;
  amountInPaise: number;
  method: string;
  paidTo?: string | null;
  reference?: string | null;
  note?: string | null;
  billUrl?: string | null;
  billName?: string | null;
  createdByUserId: string;
}

/** Checks an expense before it is written; the message is for the person typing. */
export function checkExpense(p: Pick<AddExpenseParams, "spentOn" | "category" | "amountInPaise" | "method" | "note">): string | null {
  if (!DAY.test(p.spentOn)) return "Pick the date it was paid.";
  if (p.spentOn > indiaToday()) return "An expense cannot be dated in the future.";
  if (!isExpenseCategory(p.category)) return "Pick a category.";
  if (!Number.isInteger(p.amountInPaise) || p.amountInPaise <= 0) return "Enter the amount paid.";
  if (p.amountInPaise > 1_00_00_000_00) return "That amount looks wrong — check the zeros.";
  if (!isPaymentMethod(p.method)) return "Say how it was paid.";
  if (p.category === "misc" && !p.note?.trim()) return "Say what it was for in the note.";
  return null;
}

export async function addExpense(db: Db, p: AddExpenseParams) {
  const problem = checkExpense(p);
  if (problem) throw new Error(problem);
  const [row] = await db
    .insert(expense)
    .values({
      clinicId: p.clinicId,
      spentOn: p.spentOn,
      category: p.category,
      amountInPaise: p.amountInPaise,
      method: p.method,
      paidTo: p.paidTo?.trim() || null,
      reference: p.reference?.trim() || null,
      note: p.note?.trim() || null,
      billUrl: p.billUrl ?? null,
      billName: p.billName ?? null,
      createdByUserId: p.createdByUserId,
    })
    .returning();
  return row!;
}

/** Struck through with a reason, never deleted — as a payment is. */
export async function voidExpense(db: Db, p: { id: string; clinicId: string; reason: string; actorId: string }) {
  const reason = p.reason.trim();
  if (!reason) throw new Error("Say why this expense is being cancelled.");
  const [row] = await db
    .update(expense)
    .set({ voidedAt: new Date(), voidReason: reason, voidedByUserId: p.actorId })
    .where(and(eq(expense.id, p.id), eq(expense.clinicId, p.clinicId), isNull(expense.voidedAt)))
    .returning();
  if (!row) throw new Error("That expense is already cancelled.");
  return row;
}

/* ─────────────────────────── monthly repeats ─────────────────────────── */

export interface RecurringRow {
  id: string;
  category: string;
  amountInPaise: number;
  method: string;
  paidTo: string | null;
  note: string | null;
  dayOfMonth: number;
  startsOn: string;
  active: boolean;
  lastMonth: string | null;
}

export async function listRecurring(db: Db, clinicId: string): Promise<RecurringRow[]> {
  const rows = await db
    .select({
      id: expenseRecurring.id,
      category: expenseRecurring.category,
      amountInPaise: expenseRecurring.amountInPaise,
      method: expenseRecurring.method,
      paidTo: expenseRecurring.paidTo,
      note: expenseRecurring.note,
      dayOfMonth: expenseRecurring.dayOfMonth,
      startsOn: expenseRecurring.startsOn,
      active: expenseRecurring.active,
      // Spelled out: inside a subquery drizzle would leave the columns unqualified,
      // and "id" would then mean the expense's own id.
      lastMonth: sql<string | null>`(select max(e.recurring_month) from expense e where e.recurring_id = "expense_recurring"."id")`,
    })
    .from(expenseRecurring)
    .where(eq(expenseRecurring.clinicId, clinicId))
    .orderBy(desc(expenseRecurring.active), expenseRecurring.dayOfMonth);
  return rows;
}

export async function addRecurring(
  db: Db,
  p: {
    clinicId: string;
    category: string;
    amountInPaise: number;
    method: string;
    paidTo?: string | null;
    note?: string | null;
    dayOfMonth: number;
    startsOn: string;
    createdByUserId: string;
  },
) {
  const problem = checkExpense({ spentOn: indiaToday(), category: p.category, amountInPaise: p.amountInPaise, method: p.method, note: p.note });
  if (problem) throw new Error(problem);
  if (!Number.isInteger(p.dayOfMonth) || p.dayOfMonth < 1 || p.dayOfMonth > 28) throw new Error("Pick a day between 1 and 28.");
  if (!DAY.test(p.startsOn)) throw new Error("Pick the month it starts.");
  const [row] = await db
    .insert(expenseRecurring)
    .values({
      clinicId: p.clinicId,
      category: p.category,
      amountInPaise: p.amountInPaise,
      method: p.method,
      paidTo: p.paidTo?.trim() || null,
      note: p.note?.trim() || null,
      dayOfMonth: p.dayOfMonth,
      startsOn: p.startsOn.slice(0, 8) + "01",
      createdByUserId: p.createdByUserId,
    })
    .returning();
  return row!;
}

export async function setRecurringActive(db: Db, p: { id: string; clinicId: string; active: boolean }) {
  const [row] = await db
    .update(expenseRecurring)
    .set({ active: p.active, updatedAt: new Date() })
    .where(and(eq(expenseRecurring.id, p.id), eq(expenseRecurring.clinicId, p.clinicId)))
    .returning();
  if (!row) throw new Error("That monthly expense no longer exists.");
  return row;
}

/**
 * Write the month's row for every repeat whose day has come.
 *
 * Run whenever Billing is opened, rather than by the worker: nothing about it
 * is urgent, and it is idempotent — the unique (repeat, month) index means a
 * second run, or two people opening Billing at once, writes nothing more. A
 * clinic that did not open Billing for a while catches up, up to a year back.
 */
export async function postDueRecurring(db: Db, clinicId: string, today = indiaToday()): Promise<number> {
  const repeats = await db
    .select()
    .from(expenseRecurring)
    .where(and(eq(expenseRecurring.clinicId, clinicId), eq(expenseRecurring.active, true)));
  let posted = 0;
  for (const r of repeats) {
    const first = r.startsOn.slice(0, 7);
    for (let i = 11; i >= 0; i--) {
      const month = shiftMonth(today.slice(0, 7), -i);
      if (month < first) continue;
      const spentOn = `${month}-${String(r.dayOfMonth).padStart(2, "0")}`;
      if (spentOn > today) continue;
      const inserted = await db
        .insert(expense)
        .values({
          clinicId,
          spentOn,
          category: r.category,
          amountInPaise: r.amountInPaise,
          method: r.method,
          paidTo: r.paidTo,
          note: r.note,
          recurringId: r.id,
          recurringMonth: month,
          createdByUserId: r.createdByUserId,
        })
        .onConflictDoNothing()
        .returning({ id: expense.id });
      posted += inserted.length;
    }
  }
  return posted;
}

/* ─────────────────────────── cash and profit ─────────────────────────── */

/** India day of a payment. */
const payDay = sql`(${payment.collectedAt} + interval '330 minutes')::date`;

/**
 * The drawer at closing: cash taken, less cash paid out and cash sent to the
 * bank, for one day. Whatever is in the till should match the last figure.
 */
export async function cashClosing(db: Db, clinicId: string, day: string) {
  const [[cashIn], [cashOut], [banked]] = await Promise.all([
    db
      .select({ amount: sql<number>`coalesce(sum(${payment.amountInPaise}), 0)::int`, count: sql<number>`count(*)::int` })
      .from(payment)
      .innerJoin(contact, eq(contact.id, payment.contactId))
      .where(
        and(eq(contact.clinicId, clinicId), eq(payment.method, "cash"), isNull(payment.voidedAt), sql`${payDay} = ${day}::date`),
      ),
    db
      .select({ amount: sql<number>`coalesce(sum(${expense.amountInPaise}), 0)::int`, count: sql<number>`count(*)::int` })
      .from(expense)
      .where(and(eq(expense.clinicId, clinicId), eq(expense.method, "cash"), isNull(expense.voidedAt), eq(expense.spentOn, day))),
    db
      .select({ amount: sql<number>`coalesce(sum(${cashDeposit.amountInPaise}), 0)::int`, count: sql<number>`count(*)::int` })
      .from(cashDeposit)
      .where(and(eq(cashDeposit.clinicId, clinicId), isNull(cashDeposit.voidedAt), eq(cashDeposit.depositedOn, day))),
  ]);
  const inPaise = cashIn?.amount ?? 0;
  const outPaise = cashOut?.amount ?? 0;
  const bankPaise = banked?.amount ?? 0;
  return {
    day,
    cashInPaise: inPaise,
    cashInCount: cashIn?.count ?? 0,
    cashOutPaise: outPaise,
    cashOutCount: cashOut?.count ?? 0,
    toBankPaise: bankPaise,
    toBankCount: banked?.count ?? 0,
    drawerPaise: inPaise - outPaise - bankPaise,
  };
}

/* ─────────────────────────── cash to bank ─────────────────────────── */

export interface CashDepositRow {
  id: string;
  depositedOn: string;
  amountInPaise: number;
  via: string;
  personName: string | null;
  reference: string | null;
  note: string | null;
  voided: boolean;
  voidReason: string | null;
  enteredBy: string | null;
}

/** Cash sent to the bank over a range, newest first; voided rows stay, struck through. */
export async function listCashDeposits(db: Db, f: { clinicId: string; from: string; to: string; createdBy?: string | null }) {
  const parts: SQL[] = [eq(cashDeposit.clinicId, f.clinicId), sql`${cashDeposit.depositedOn} between ${f.from} and ${f.to}`];
  if (f.createdBy) parts.push(eq(cashDeposit.createdByUserId, f.createdBy));
  const rows = await db
    .select({
      id: cashDeposit.id,
      depositedOn: sql<string>`to_char(${cashDeposit.depositedOn}, 'YYYY-MM-DD')`,
      amountInPaise: cashDeposit.amountInPaise,
      via: cashDeposit.via,
      personName: cashDeposit.personName,
      reference: cashDeposit.reference,
      note: cashDeposit.note,
      voidedAt: cashDeposit.voidedAt,
      voidReason: cashDeposit.voidReason,
      enteredBy: user.name,
    })
    .from(cashDeposit)
    .leftJoin(user, eq(user.id, cashDeposit.createdByUserId))
    .where(and(...parts))
    .orderBy(desc(cashDeposit.depositedOn), desc(cashDeposit.createdAt))
    .limit(500);
  const out: CashDepositRow[] = rows.map(({ voidedAt, ...r }) => ({ ...r, voided: Boolean(voidedAt) }));
  return {
    rows: out,
    totalInPaise: out.filter((r) => !r.voided).reduce((s, r) => s + r.amountInPaise, 0),
  };
}

export interface AddCashDepositParams {
  clinicId: string;
  depositedOn: string;
  amountInPaise: number;
  via: string;
  personName?: string | null;
  reference?: string | null;
  note?: string | null;
  createdByUserId: string;
}

/** Checks a deposit before it is written; the message is for the person typing. */
export function checkCashDeposit(p: Pick<AddCashDepositParams, "depositedOn" | "amountInPaise" | "via" | "personName">): string | null {
  if (!DAY.test(p.depositedOn)) return "Pick the day the cash went.";
  if (p.depositedOn > indiaToday()) return "A deposit cannot be dated in the future.";
  if (!Number.isInteger(p.amountInPaise) || p.amountInPaise <= 0) return "Enter the amount.";
  if (p.amountInPaise > 1_00_00_000_00) return "That amount looks wrong — check the zeros.";
  if (!isCashDepositVia(p.via)) return "Say how it reached the bank.";
  if (p.via === "person" && !p.personName?.trim()) return "Say who took the cash.";
  return null;
}

export async function addCashDeposit(db: Db, p: AddCashDepositParams) {
  const problem = checkCashDeposit(p);
  if (problem) throw new Error(problem);
  const [row] = await db
    .insert(cashDeposit)
    .values({
      clinicId: p.clinicId,
      depositedOn: p.depositedOn,
      amountInPaise: p.amountInPaise,
      via: p.via,
      personName: p.via === "person" ? p.personName!.trim() : null,
      reference: p.reference?.trim() || null,
      note: p.note?.trim() || null,
      createdByUserId: p.createdByUserId,
    })
    .returning();
  return row!;
}

/** Struck through with a reason, never deleted — as an expense is. */
export async function voidCashDeposit(db: Db, p: { id: string; clinicId: string; reason: string; actorId: string }) {
  const reason = p.reason.trim();
  if (!reason) throw new Error("Say why this deposit is being cancelled.");
  const [row] = await db
    .update(cashDeposit)
    .set({ voidedAt: new Date(), voidReason: reason, voidedByUserId: p.actorId })
    .where(and(eq(cashDeposit.id, p.id), eq(cashDeposit.clinicId, p.clinicId), isNull(cashDeposit.voidedAt)))
    .returning();
  if (!row) throw new Error("That deposit is already cancelled.");
  return row;
}

/** Collected and spent per calendar month, the last `months` of them. */
export async function monthlyMargin(db: Db, clinicId: string, months = 6, today = indiaToday()) {
  const last = today.slice(0, 7);
  const first = shiftMonth(last, -(months - 1));
  const payMonth = sql<string>`to_char(${payment.collectedAt} + interval '330 minutes', 'YYYY-MM')`;
  const spendMonth = sql<string>`to_char(${expense.spentOn}, 'YYYY-MM')`;
  const [income, spend] = await Promise.all([
    db
      .select({ month: payMonth, amount: sql<number>`coalesce(sum(${payment.amountInPaise}), 0)::int` })
      .from(payment)
      .innerJoin(contact, eq(contact.id, payment.contactId))
      .where(and(eq(contact.clinicId, clinicId), isNull(payment.voidedAt), sql`${payMonth} between ${first} and ${last}`))
      .groupBy(payMonth),
    db
      .select({ month: spendMonth, amount: sql<number>`coalesce(sum(${expense.amountInPaise}), 0)::int` })
      .from(expense)
      .where(and(eq(expense.clinicId, clinicId), isNull(expense.voidedAt), sql`${spendMonth} between ${first} and ${last}`))
      .groupBy(spendMonth),
  ]);
  const inBy = new Map(income.map((r) => [r.month, r.amount]));
  const outBy = new Map(spend.map((r) => [r.month, r.amount]));
  const rows: { month: string; incomeInPaise: number; expenseInPaise: number; netInPaise: number }[] = [];
  for (let m = first; m <= last; m = shiftMonth(m, 1)) {
    const i = inBy.get(m) ?? 0;
    const o = outBy.get(m) ?? 0;
    rows.push({ month: m, incomeInPaise: i, expenseInPaise: o, netInPaise: i - o });
  }
  return rows;
}

/** Money in for a range, live payments only — the other side of the margin. */
export async function collectedBetween(db: Db, clinicId: string, from: string, to: string): Promise<number> {
  const [row] = await db
    .select({ amount: sql<number>`coalesce(sum(${payment.amountInPaise}), 0)::int` })
    .from(payment)
    .innerJoin(contact, eq(contact.id, payment.contactId))
    .where(and(eq(contact.clinicId, clinicId), isNull(payment.voidedAt), sql`${payDay} between ${from}::date and ${to}::date`));
  return row?.amount ?? 0;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM moved by n months. */
function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

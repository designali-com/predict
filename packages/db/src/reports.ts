import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { appointment, clinic, contact, leadSubmission, payment, user } from "./schema";
import type * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

/**
 * What the ads actually bought.
 *
 * The lead count is the number everybody already has and the one that decides
 * nothing: an ad set that produces fifty leads and no patients is worse than
 * one that produces five and three courses. Every figure here is therefore
 * carried through to money, and every figure is per clinic, because two
 * clinics with one budget between them is exactly where a wrong attribution
 * costs the most.
 *
 * Money is counted from payments actually taken (voided ones excluded), not
 * from what was prescribed — a plan nobody paid for is not revenue.
 */

export interface ReportRange {
  /** Inclusive. */
  from: Date;
  /** Exclusive, so a day is [00:00, next 00:00). */
  to: Date;
  /** Null means every clinic — superadmin only. */
  clinicId?: string | null;
}

const paid = () => and(isNull(payment.voidedAt), sql`${payment.amountInPaise} > 0`);

function clinicFilter(clinicId: string | null | undefined) {
  return clinicId ? eq(contact.clinicId, clinicId) : undefined;
}

export interface Funnel {
  leads: number;
  contacted: number;
  booked: number;
  attended: number;
  patients: number;
  revenueInPaise: number;
  /** Leads with no owner yet — the ones quietly going nowhere. */
  unassigned: number;
}

/** The headline numbers for one clinic over one period. */
export async function funnel(db: Db, range: ReportRange): Promise<Funnel> {
  const window = and(gte(contact.createdAt, range.from), lt(contact.createdAt, range.to));

  const [counts] = await db
    .select({
      leads: sql<number>`count(*)::int`,
      // "Somebody actually worked it" — any status past New.
      contacted: sql<number>`count(*) filter (where ${contact.leadStatus} is not null and ${contact.leadStatus} <> 'NEW')::int`,
      unassigned: sql<number>`count(*) filter (where ${contact.assignedUserId} is null and ${contact.assignedRole} is null)::int`,
      patients: sql<number>`count(*) filter (where ${contact.stage} = 'PATIENT')::int`,
    })
    .from(contact)
    .where(and(window, clinicFilter(range.clinicId)));

  // Booked and attended come from appointment rows, never from a stage
  // somebody typed: the funnel must not be able to claim a visit that is not
  // on the books.
  const [visits] = await db
    .select({
      booked: sql<number>`count(distinct ${appointment.contactId}) filter (where ${appointment.status} <> 'cancelled')::int`,
      attended: sql<number>`count(distinct ${appointment.contactId}) filter (where ${appointment.status} = 'completed')::int`,
    })
    .from(appointment)
    .innerJoin(contact, eq(contact.id, appointment.contactId))
    .where(and(window, clinicFilter(range.clinicId)));

  const [money] = await db
    .select({ total: sql<number>`coalesce(sum(${payment.amountInPaise}), 0)::bigint` })
    .from(payment)
    .innerJoin(contact, eq(contact.id, payment.contactId))
    .where(
      and(
        gte(payment.createdAt, range.from),
        lt(payment.createdAt, range.to),
        paid(),
        clinicFilter(range.clinicId),
      ),
    );

  return {
    leads: counts?.leads ?? 0,
    contacted: counts?.contacted ?? 0,
    booked: visits?.booked ?? 0,
    attended: visits?.attended ?? 0,
    patients: counts?.patients ?? 0,
    unassigned: counts?.unassigned ?? 0,
    revenueInPaise: Number(money?.total ?? 0),
  };
}

/**
 * Note the difference from funnel(): that counts money paid inside the
 * period, this counts everything the period's leads have paid since. Cash
 * flow is the first question; whether an ad set repaid its cost is this one,
 * and a course bought three weeks after the click still belongs to that ad.
 */
export interface SourceRow {
  key: string;
  label: string;
  leads: number;
  booked: number;
  attended: number;
  revenueInPaise: number;
}

type Dimension = "source" | "campaign" | "adset" | "icp" | "city";

/**
 * The same funnel, cut by where the leads came from.
 *
 * Revenue is attributed to the lead, not to the visit: the ad that brought
 * somebody in gets the credit for what they eventually paid, which is the
 * only way "cost per patient" can be worked out later.
 */
export async function byDimension(db: Db, dimension: Dimension, range: ReportRange): Promise<SourceRow[]> {
  const column = {
    source: sql`coalesce(${contact.source}, 'unknown')`,
    campaign: sql`coalesce(${contact.campaign}, 'none')`,
    adset: sql`coalesce(max(${leadSubmission.adsetName}), 'none')`,
    icp: sql`coalesce(${contact.interest}, 'none')`,
    city: sql`coalesce(${contact.city}, 'unknown')`,
  }[dimension];

  // Ad set lives on the submission, so that cut needs the join; the rest sit
  // on the contact itself.
  const needsSubmission = dimension === "adset";
  const key = needsSubmission ? sql`coalesce(${leadSubmission.adsetName}, 'none')` : column;

  const base = db
    .select({
      key: sql<string>`${key}`,
      leads: sql<number>`count(distinct ${contact.id})::int`,
      booked: sql<number>`count(distinct ${appointment.contactId}) filter (where ${appointment.status} <> 'cancelled')::int`,
      attended: sql<number>`count(distinct ${appointment.contactId}) filter (where ${appointment.status} = 'completed')::int`,
      revenue: sql<number>`coalesce(sum(distinct ${payment.amountInPaise}) filter (where ${payment.voidedAt} is null), 0)::bigint`,
    })
    .from(contact)
    .leftJoin(appointment, eq(appointment.contactId, contact.id))
    .leftJoin(payment, and(eq(payment.contactId, contact.id), isNull(payment.voidedAt)));

  const withJoin = needsSubmission
    ? base.leftJoin(leadSubmission, eq(leadSubmission.contactId, contact.id))
    : base;

  const rows = await withJoin
    .where(
      and(gte(contact.createdAt, range.from), lt(contact.createdAt, range.to), clinicFilter(range.clinicId)),
    )
    .groupBy(key)
    .orderBy(sql`count(distinct ${contact.id}) desc`)
    .limit(50);

  return rows.map((r) => ({
    key: r.key,
    label: r.key === "none" || r.key === "unknown" ? `(${r.key})` : r.key.replace(/_/g, " "),
    leads: r.leads,
    booked: r.booked,
    attended: r.attended,
    revenueInPaise: Number(r.revenue ?? 0),
  }));
}

export interface TeamRow {
  userId: string | null;
  name: string;
  leads: number;
  worked: number;
  booked: number;
  /** Median minutes from the lead arriving to its status moving off New. */
  medianFirstTouchMinutes: number | null;
}

/** Who is working what, and how fast the first touch happens. */
export async function teamPerformance(db: Db, range: ReportRange): Promise<TeamRow[]> {
  const rows = await db
    .select({
      userId: contact.assignedUserId,
      name: sql<string>`coalesce(max(${user.name}), 'Unassigned')`,
      leads: sql<number>`count(*)::int`,
      worked: sql<number>`count(*) filter (where ${contact.leadStatus} is not null and ${contact.leadStatus} <> 'NEW')::int`,
      booked: sql<number>`count(*) filter (where ${contact.leadStatus} = 'APPOINTMENT_BOOKED' or ${contact.stage} in ('BOOKED','PATIENT'))::int`,
      median: sql<number | null>`percentile_cont(0.5) within group (
        order by extract(epoch from (${contact.leadStatusAt} - ${contact.createdAt})) / 60
      ) filter (where ${contact.leadStatusAt} is not null and ${contact.leadStatus} <> 'NEW')`,
    })
    .from(contact)
    .leftJoin(user, eq(user.id, contact.assignedUserId))
    .where(
      and(gte(contact.createdAt, range.from), lt(contact.createdAt, range.to), clinicFilter(range.clinicId)),
    )
    .groupBy(contact.assignedUserId)
    .orderBy(sql`count(*) desc`);

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    leads: r.leads,
    worked: r.worked,
    booked: r.booked,
    medianFirstTouchMinutes: r.median === null ? null : Math.round(Number(r.median)),
  }));
}

export interface ClinicRow extends Funnel {
  clinicId: string;
  name: string;
}

/** Every clinic side by side — the superadmin's view. */
export async function clinicComparison(db: Db, range: Omit<ReportRange, "clinicId">): Promise<ClinicRow[]> {
  const clinics = await db.select({ id: clinic.id, name: clinic.name }).from(clinic).orderBy(clinic.createdAt);
  const rows: ClinicRow[] = [];
  for (const c of clinics) {
    rows.push({ clinicId: c.id, name: c.name, ...(await funnel(db, { ...range, clinicId: c.id })) });
  }
  return rows;
}

/** Leads that arrived but belong to no clinic — a routing gap, not a number. */
export async function unclaimedLeads(db: Db, range: Omit<ReportRange, "clinicId">): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contact)
    .where(and(gte(contact.createdAt, range.from), lt(contact.createdAt, range.to), isNull(contact.clinicId)));
  return row?.n ?? 0;
}

/** Contacts by id, for a drill-down that never leaves the clinic. */
export async function leadsIn(db: Db, range: ReportRange, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({ id: contact.id, name: contact.name, phone: contact.phone })
    .from(contact)
    .where(and(inArray(contact.id, ids), clinicFilter(range.clinicId)));
}

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { startReferralsFor } from "./predict-referral";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  biomarker,
  biomarkerReading,
  bloodTestOrder,
  bloodTestOrderItem,
  patientRecord,
  payment,
  report,
} from "./schema";
import type * as schema from "./schema";
import { totalPaid } from "./payment";

type Database = NodePgDatabase<typeof schema>;

/**
 * Blood tests as something the clinic sells.
 *
 * A panel is not one product with one price. The clinic picks which markers to
 * run, and the bill follows from that choice — so the order carries a line per
 * marker, each at the price it held on the day, and the total is their sum.
 *
 * The order then becomes the join everything else hangs from: the payment that
 * settles it, the lab's report, and every reading taken off that report. That
 * is what lets a number in the chart be traced back to the draw it came from
 * rather than floating free with only a date.
 */

export const BloodTestStatus = {
  /** Chosen and billed; blood not drawn yet. */
  ORDERED: "ordered",
  /** Sample taken, waiting on the lab. */
  COLLECTED: "collected",
  /** Values are in. */
  REPORTED: "reported",
  CANCELLED: "cancelled",
} as const;

export type BloodTestStatus = (typeof BloodTestStatus)[keyof typeof BloodTestStatus];

export interface CreateOrderParams {
  patientId: string;
  biomarkerIds: string[];
  /** Defaults to today in the clinic's zone. */
  orderedOn?: string;
  collectedOn?: string | null;
  note?: string | null;
  actorId?: string | null;
}

/** Today where the clinic is, which is the only "today" that matters here. */
export function clinicToday(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

export async function createBloodTestOrder(db: Database, params: CreateOrderParams) {
  const ids = [...new Set(params.biomarkerIds.filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("Choose at least one test.");
  }

  const [chart] = await db
    .select()
    .from(patientRecord)
    .where(eq(patientRecord.id, params.patientId))
    .limit(1);
  if (!chart) throw new Error("No such patient.");

  const markers = await db.select().from(biomarker).where(inArray(biomarker.id, ids));
  if (markers.length !== ids.length) {
    throw new Error("One of those tests is no longer in the catalogue.");
  }

  // Priced at zero until somebody sets a price. Allowed on purpose: the clinic
  // runs the test either way, and refusing the order would block the work to
  // protect a number. The unpriced count is reported so it is not silent.
  const total = markers.reduce((sum, m) => sum + m.priceInPaise, 0);

  const [order] = await db
    .insert(bloodTestOrder)
    .values({
      patientId: chart.id,
      contactId: chart.contactId,
      status: params.collectedOn ? BloodTestStatus.COLLECTED : BloodTestStatus.ORDERED,
      orderedOn: params.orderedOn ?? clinicToday(),
      collectedOn: params.collectedOn ?? null,
      totalInPaise: total,
      note: params.note?.trim() || null,
      orderedByUserId: params.actorId ?? null,
    })
    .returning();

  // A patient referred to Predict for this: the referral is now with Predict.
  await startReferralsFor(db, chart.id);

  await db.insert(bloodTestOrderItem).values(
    markers.map((m) => ({
      orderId: order!.id,
      biomarkerId: m.id,
      priceInPaise: m.priceInPaise,
    })),
  );

  return {
    order: order!,
    itemCount: markers.length,
    unpricedCount: markers.filter((m) => m.priceInPaise === 0).length,
  };
}

export interface BloodTestOrderView {
  id: string;
  status: string;
  orderedOn: string;
  collectedOn: string | null;
  totalInPaise: number;
  paidInPaise: number;
  dueInPaise: number;
  note: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  items: {
    biomarkerId: string;
    name: string;
    shortCode: string;
    unit: string | null;
    priceInPaise: number;
  }[];
  payments: {
    id: string;
    amountInPaise: number;
    method: string;
    receiptNo: string | null;
    collectedAt: Date;
    voidedAt: Date | null;
  }[];
  reports: { id: string; fileUrl: string; fileName: string | null; uploadedAt: Date }[];
  /** How many of this order's markers already have a value recorded. */
  resultsIn: number;
  /** Booked sample collection (lab), if any. */
  scheduledAt: Date | null;
  /** centre | home */
  collectionMode: string | null;
}

/** Every blood test for one chart, newest first, with money and results. */
export async function bloodTestOrdersFor(
  db: Database,
  patientId: string,
): Promise<BloodTestOrderView[]> {
  const orders = await db
    .select()
    .from(bloodTestOrder)
    .where(eq(bloodTestOrder.patientId, patientId))
    .orderBy(desc(bloodTestOrder.orderedOn), desc(bloodTestOrder.createdAt));

  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);

  const [items, payments, reports, readings] = await Promise.all([
    db
      .select({
        orderId: bloodTestOrderItem.orderId,
        biomarkerId: bloodTestOrderItem.biomarkerId,
        priceInPaise: bloodTestOrderItem.priceInPaise,
        name: biomarker.name,
        shortCode: biomarker.shortCode,
        unit: biomarker.unit,
      })
      .from(bloodTestOrderItem)
      .innerJoin(biomarker, eq(biomarker.id, bloodTestOrderItem.biomarkerId))
      .where(inArray(bloodTestOrderItem.orderId, orderIds))
      .orderBy(asc(biomarker.name)),
    db.select().from(payment).where(inArray(payment.bloodTestOrderId, orderIds)),
    db.select().from(report).where(inArray(report.bloodTestOrderId, orderIds)),
    db
      .select({
        orderId: biomarkerReading.bloodTestOrderId,
        biomarkerId: biomarkerReading.biomarkerId,
      })
      .from(biomarkerReading)
      .where(inArray(biomarkerReading.bloodTestOrderId, orderIds)),
  ]);

  return orders.map((o) => {
    const mine = payments.filter((p) => p.bloodTestOrderId === o.id);
    const paid = totalPaid(mine);
    const resultIds = new Set(
      readings.filter((r) => r.orderId === o.id).map((r) => r.biomarkerId),
    );

    return {
      id: o.id,
      status: o.status,
      orderedOn: o.orderedOn,
      collectedOn: o.collectedOn,
      totalInPaise: o.totalInPaise,
      paidInPaise: paid,
      // A cancelled order owes nothing, whatever its lines add up to.
      dueInPaise: o.cancelledAt ? 0 : Math.max(0, o.totalInPaise - paid),
      note: o.note,
      cancelledAt: o.cancelledAt,
      cancelReason: o.cancelReason,
      items: items
        .filter((i) => i.orderId === o.id)
        .map((i) => ({
          biomarkerId: i.biomarkerId,
          name: i.name,
          shortCode: i.shortCode,
          unit: i.unit,
          priceInPaise: i.priceInPaise,
        })),
      payments: mine
        .sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime())
        .map((p) => ({
          id: p.id,
          amountInPaise: p.amountInPaise,
          method: p.method,
          receiptNo: p.receiptNo,
          collectedAt: p.collectedAt,
          voidedAt: p.voidedAt,
        })),
      reports: reports
        .filter((r) => r.bloodTestOrderId === o.id)
        .map((r) => ({
          id: r.id,
          fileUrl: r.fileUrl,
          fileName: r.fileName,
          uploadedAt: r.uploadedAt,
        })),
      resultsIn: resultIds.size,
      // The lab's booking, for the chart: when and where the sample is taken.
      scheduledAt: o.scheduledAt,
      collectionMode: o.collectionMode,
    };
  });
}

/** What is still owed on one order, for the payment screen. */
export async function bloodTestBalance(db: Database, orderId: string) {
  const [order] = await db
    .select()
    .from(bloodTestOrder)
    .where(eq(bloodTestOrder.id, orderId))
    .limit(1);
  if (!order) return null;

  const rows = await db.select().from(payment).where(eq(payment.bloodTestOrderId, orderId));
  const paid = totalPaid(rows);

  return {
    order,
    chargedInPaise: order.totalInPaise,
    paidInPaise: paid,
    dueInPaise: order.cancelledAt ? 0 : Math.max(0, order.totalInPaise - paid),
    settled: order.cancelledAt != null || paid >= order.totalInPaise,
  };
}

/**
 * Move an order along, or call off one that was never drawn.
 *
 * Cancelling rather than deleting, the same as a payment: an order somebody was
 * quoted for is a thing that happened, and a row that vanishes leaves the desk
 * with nothing to explain.
 */
export async function updateBloodTestOrder(
  db: Database,
  orderId: string,
  changes: {
    status?: BloodTestStatus;
    collectedOn?: string | null;
    note?: string | null;
    cancelReason?: string;
  },
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (changes.cancelReason !== undefined) {
    const reason = changes.cancelReason.trim();
    if (!reason) throw new Error("Say why this test is being cancelled.");
    patch.status = BloodTestStatus.CANCELLED;
    patch.cancelledAt = new Date();
    patch.cancelReason = reason;
  } else {
    if (changes.status) patch.status = changes.status;
    if (changes.collectedOn !== undefined) {
      patch.collectedOn = changes.collectedOn;
      // Recording the draw date is the act of collecting it; making somebody
      // also pick a status from a list would be two steps for one fact.
      if (changes.collectedOn && !changes.status) patch.status = BloodTestStatus.COLLECTED;
    }
    if (changes.note !== undefined) patch.note = changes.note?.trim() || null;
  }

  const [updated] = await db
    .update(bloodTestOrder)
    .set(patch)
    .where(eq(bloodTestOrder.id, orderId))
    .returning();

  return updated ?? null;
}

/** Marks an order reported once values have been filed against it. */
export async function markReported(db: Database, orderId: string) {
  await db
    .update(bloodTestOrder)
    .set({ status: BloodTestStatus.REPORTED, updatedAt: new Date() })
    .where(and(eq(bloodTestOrder.id, orderId), eq(bloodTestOrder.status, BloodTestStatus.ORDERED)));
  await db
    .update(bloodTestOrder)
    .set({ status: BloodTestStatus.REPORTED, updatedAt: new Date() })
    .where(
      and(eq(bloodTestOrder.id, orderId), eq(bloodTestOrder.status, BloodTestStatus.COLLECTED)),
    );
}

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { bloodTestOrder, bloodTestOrderEvent, clinic, contact, patientRecord, rolePermission, user } from "./schema";
import type * as schema from "./schema";
import { BloodTestStatus, bloodTestOrdersFor, clinicToday, type BloodTestOrderView } from "./blood-test";

type Db = NodePgDatabase<typeof schema>;

/**
 * The lab's view of blood-test orders (lab.predict.fit).
 *
 * A doctor — ours or a partner hospital's — writes the order on the patient's
 * Blood test tab. Then:
 *
 *   to_book     ordered, no collection booked yet
 *   booked      a slot booked (centre or home), a field technician assigned
 *   on_the_way  the technician has set out (home collection)
 *   collected   sample taken — the kit's unique code recorded
 *   in_lab      sent to the outside lab that runs the test
 *   reported    values confirmed (the report upload does this)
 *   cancelled
 *
 * The stage is derived from the order's own columns, so the lab, the
 * technician's phone and the doctor's chart can never disagree about it.
 * Every step is also written to blood_test_order_event: who, what, when.
 */

export type LabStage = "to_book" | "booked" | "on_the_way" | "collected" | "in_lab" | "reported" | "cancelled";

export const LAB_STAGES: { value: LabStage; label: string }[] = [
  { value: "to_book", label: "To book" },
  { value: "booked", label: "Booked" },
  { value: "on_the_way", label: "On the way" },
  { value: "collected", label: "Collected" },
  { value: "in_lab", label: "In lab" },
  { value: "reported", label: "Reported" },
  { value: "cancelled", label: "Cancelled" },
];

export type CollectionMode = "centre" | "home";

type StageInput = {
  status: string;
  scheduledAt: Date | string | null;
  onTheWayAt?: Date | string | null;
  sentToLabAt?: Date | string | null;
};

export function stageOf(o: StageInput): LabStage {
  if (o.status === BloodTestStatus.CANCELLED) return "cancelled";
  if (o.status === BloodTestStatus.REPORTED) return "reported";
  if (o.status === BloodTestStatus.COLLECTED) return o.sentToLabAt ? "in_lab" : "collected";
  if (o.onTheWayAt) return "on_the_way";
  return o.scheduledAt ? "booked" : "to_book";
}

function stageFilter(stage: LabStage): SQL {
  const ordered = eq(bloodTestOrder.status, BloodTestStatus.ORDERED);
  const collected = eq(bloodTestOrder.status, BloodTestStatus.COLLECTED);
  switch (stage) {
    case "cancelled":
      return eq(bloodTestOrder.status, BloodTestStatus.CANCELLED);
    case "reported":
      return eq(bloodTestOrder.status, BloodTestStatus.REPORTED);
    case "in_lab":
      return and(collected, isNotNull(bloodTestOrder.sentToLabAt))!;
    case "collected":
      return and(collected, isNull(bloodTestOrder.sentToLabAt))!;
    case "on_the_way":
      return and(ordered, isNotNull(bloodTestOrder.onTheWayAt))!;
    case "booked":
      return and(ordered, isNull(bloodTestOrder.onTheWayAt), isNotNull(bloodTestOrder.scheduledAt))!;
    case "to_book":
      return and(ordered, isNull(bloodTestOrder.onTheWayAt), isNull(bloodTestOrder.scheduledAt))!;
  }
}

const paidSql = sql<number>`coalesce((
  select sum(p.amount_in_paise) from payment p
  where p.blood_test_order_id = ${bloodTestOrder.id} and p.voided_at is null
), 0)::int`;

const itemsSql = sql<number>`(
  select count(*) from blood_test_order_item i where i.order_id = ${bloodTestOrder.id}
)::int`;

const orderer = alias(user, "orderer");
const tech = alias(user, "tech");

export interface LabOrderRow {
  id: string;
  stage: LabStage;
  status: string;
  orderedOn: string;
  scheduledAt: string | null;
  collectionMode: string | null;
  collectionAddress: string | null;
  technician: string | null;
  technicianUserId: string | null;
  kitCode: string | null;
  totalInPaise: number;
  paidInPaise: number;
  items: number;
  patient: { chartId: string; code: string; name: string; phone: string | null };
  hospital: { id: string | null; name: string | null; partner: boolean };
  orderedBy: string | null;
}

function baseQuery(db: Db) {
  return db
    .select({
      id: bloodTestOrder.id,
      status: bloodTestOrder.status,
      orderedOn: bloodTestOrder.orderedOn,
      scheduledAt: bloodTestOrder.scheduledAt,
      onTheWayAt: bloodTestOrder.onTheWayAt,
      sentToLabAt: bloodTestOrder.sentToLabAt,
      collectionMode: bloodTestOrder.collectionMode,
      collectionAddress: bloodTestOrder.collectionAddress,
      technicianText: bloodTestOrder.technician,
      technicianUserId: bloodTestOrder.technicianUserId,
      technicianName: tech.name,
      kitCode: bloodTestOrder.kitCode,
      totalInPaise: bloodTestOrder.totalInPaise,
      paidInPaise: paidSql,
      items: itemsSql,
      chartId: patientRecord.id,
      code: patientRecord.patientCode,
      firstName: patientRecord.firstName,
      lastName: patientRecord.lastName,
      mobile: patientRecord.mobileNumber,
      contactName: contact.name,
      contactPhone: contact.phone,
      clinicId: clinic.id,
      clinicName: clinic.name,
      clinicKind: clinic.kind,
      orderedBy: orderer.name,
      createdAt: bloodTestOrder.createdAt,
    })
    .from(bloodTestOrder)
    .innerJoin(patientRecord, eq(patientRecord.id, bloodTestOrder.patientId))
    .leftJoin(contact, eq(contact.id, bloodTestOrder.contactId))
    .leftJoin(clinic, eq(clinic.id, contact.clinicId))
    .leftJoin(orderer, eq(orderer.id, bloodTestOrder.orderedByUserId))
    .leftJoin(tech, eq(tech.id, bloodTestOrder.technicianUserId));
}

type BaseRow = Awaited<ReturnType<ReturnType<typeof baseQuery>["limit"]>>[number];

function toRow(r: BaseRow): LabOrderRow {
  return {
    id: r.id,
    stage: stageOf(r),
    status: r.status,
    orderedOn: r.orderedOn,
    scheduledAt: r.scheduledAt?.toISOString() ?? null,
    collectionMode: r.collectionMode,
    collectionAddress: r.collectionAddress,
    technician: r.technicianName ?? r.technicianText,
    technicianUserId: r.technicianUserId,
    kitCode: r.kitCode,
    totalInPaise: r.totalInPaise,
    paidInPaise: r.paidInPaise,
    items: r.items,
    patient: {
      chartId: r.chartId,
      code: r.code,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.contactName || "Patient",
      phone: r.mobile ?? r.contactPhone ?? null,
    },
    hospital: { id: r.clinicId, name: r.clinicName, partner: r.clinicKind === "partner" },
    orderedBy: r.orderedBy,
  };
}

const istDayOf = (col: typeof bloodTestOrder.scheduledAt) => sql`to_char(${col} + interval '330 minutes', 'YYYY-MM-DD')`;

/** Orders for the lab's list — newest first, or by slot when looking at a day. */
export async function listLabOrders(
  db: Db,
  filter: { stage?: LabStage | "open" | null; q?: string | null; day?: string | null; limit?: number } = {},
): Promise<LabOrderRow[]> {
  const where: SQL[] = [];
  if (filter.stage === "open") {
    where.push(or(eq(bloodTestOrder.status, BloodTestStatus.ORDERED), eq(bloodTestOrder.status, BloodTestStatus.COLLECTED))!);
  } else if (filter.stage) {
    where.push(stageFilter(filter.stage));
  }
  if (filter.day && /^\d{4}-\d{2}-\d{2}$/.test(filter.day)) {
    // The slot's day in India, not in the server's UTC.
    where.push(sql`${istDayOf(bloodTestOrder.scheduledAt)} = ${filter.day}`);
  }
  const q = filter.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    where.push(
      or(
        ilike(patientRecord.firstName, like),
        ilike(patientRecord.lastName, like),
        ilike(patientRecord.patientCode, like),
        ilike(contact.name, like),
        ilike(bloodTestOrder.kitCode, like),
        ...(digits.length >= 4 ? [ilike(patientRecord.mobileNumber, `%${digits}%`), ilike(contact.phone, `%${digits}%`)] : []),
      )!,
    );
  }

  const rows = await baseQuery(db)
    .where(where.length ? and(...where) : undefined)
    .orderBy(filter.day ? asc(bloodTestOrder.scheduledAt) : desc(bloodTestOrder.createdAt))
    .limit(Math.min(500, filter.limit ?? 200));
  return rows.map(toRow);
}

/** How many orders sit in each stage — the tab counts. */
export async function labStageCounts(db: Db): Promise<Record<LabStage, number>> {
  const rows = await db
    .select({
      status: bloodTestOrder.status,
      booked: sql<boolean>`${bloodTestOrder.scheduledAt} is not null`,
      onTheWay: sql<boolean>`${bloodTestOrder.onTheWayAt} is not null`,
      sent: sql<boolean>`${bloodTestOrder.sentToLabAt} is not null`,
      n: sql<number>`count(*)::int`,
    })
    .from(bloodTestOrder)
    .groupBy(
      bloodTestOrder.status,
      sql`${bloodTestOrder.scheduledAt} is not null`,
      sql`${bloodTestOrder.onTheWayAt} is not null`,
      sql`${bloodTestOrder.sentToLabAt} is not null`,
    );
  const out: Record<LabStage, number> = { to_book: 0, booked: 0, on_the_way: 0, collected: 0, in_lab: 0, reported: 0, cancelled: 0 };
  const flag = (b: boolean) => (b ? new Date() : null);
  for (const r of rows) {
    out[stageOf({ status: r.status, scheduledAt: flag(r.booked), onTheWayAt: flag(r.onTheWay), sentToLabAt: flag(r.sent) })] += r.n;
  }
  return out;
}

// ------------------------------------------------------------------ detail

export interface LabOrderEvent {
  kind: string;
  note: string | null;
  by: string | null;
  at: string;
}

export interface LabOrderDetail {
  order: Omit<BloodTestOrderView, "scheduledAt" | "collectionMode"> & {
    stage: LabStage;
    scheduledAt: string | null;
    collectionMode: string | null;
    collectionAddress: string | null;
    technician: string | null;
    technicianUserId: string | null;
    kitCode: string | null;
    onTheWayAt: string | null;
    sentToLabAt: string | null;
    externalLab: string | null;
    expectedReportOn: string | null;
    labNote: string | null;
    orderedBy: string | null;
    createdAt: string;
  };
  patient: {
    chartId: string;
    contactId: string | null;
    userId: string | null;
    code: string;
    name: string;
    phone: string | null;
    email: string | null;
    gender: string | null;
    dateOfBirth: string | null;
  };
  hospital: { id: string | null; name: string | null; partner: boolean };
  events: LabOrderEvent[];
}

export async function getLabOrder(db: Db, id: string): Promise<LabOrderDetail | null> {
  const [row] = await db
    .select({ order: bloodTestOrder, chart: patientRecord, person: contact, place: clinic, orderedBy: orderer.name, techName: tech.name })
    .from(bloodTestOrder)
    .innerJoin(patientRecord, eq(patientRecord.id, bloodTestOrder.patientId))
    .leftJoin(contact, eq(contact.id, bloodTestOrder.contactId))
    .leftJoin(clinic, eq(clinic.id, contact.clinicId))
    .leftJoin(orderer, eq(orderer.id, bloodTestOrder.orderedByUserId))
    .leftJoin(tech, eq(tech.id, bloodTestOrder.technicianUserId))
    .where(eq(bloodTestOrder.id, id))
    .limit(1);
  if (!row) return null;

  const view = (await bloodTestOrdersFor(db, row.chart.id)).find((o) => o.id === id);
  if (!view) return null;

  const events = await db
    .select({ kind: bloodTestOrderEvent.kind, note: bloodTestOrderEvent.note, by: user.name, at: bloodTestOrderEvent.createdAt })
    .from(bloodTestOrderEvent)
    .leftJoin(user, eq(user.id, bloodTestOrderEvent.actorUserId))
    .where(eq(bloodTestOrderEvent.orderId, id))
    .orderBy(asc(bloodTestOrderEvent.createdAt));

  const o = row.order;
  return {
    order: {
      ...view,
      stage: stageOf(o),
      scheduledAt: o.scheduledAt?.toISOString() ?? null,
      collectionMode: o.collectionMode,
      collectionAddress: o.collectionAddress,
      technician: row.techName ?? o.technician,
      technicianUserId: o.technicianUserId,
      kitCode: o.kitCode,
      onTheWayAt: o.onTheWayAt?.toISOString() ?? null,
      sentToLabAt: o.sentToLabAt?.toISOString() ?? null,
      externalLab: o.externalLab,
      expectedReportOn: o.expectedReportOn,
      labNote: o.labNote,
      orderedBy: row.orderedBy,
      createdAt: o.createdAt.toISOString(),
    },
    patient: {
      chartId: row.chart.id,
      contactId: row.chart.contactId,
      userId: row.chart.userId,
      code: row.chart.patientCode,
      name: [row.chart.firstName, row.chart.lastName].filter(Boolean).join(" ").trim() || row.person?.name || "Patient",
      phone: row.chart.mobileNumber ?? row.person?.phone ?? null,
      email: row.chart.email ?? row.person?.email ?? null,
      gender: row.chart.gender,
      dateOfBirth: row.chart.dateOfBirth,
    },
    hospital: { id: row.place?.id ?? null, name: row.place?.name ?? null, partner: row.place?.kind === "partner" },
    events: events.map((e) => ({ kind: e.kind, note: e.note, by: e.by, at: e.at.toISOString() })),
  };
}

// ------------------------------------------------------------------ steps

export async function recordOrderEvent(
  db: Db,
  orderId: string,
  kind: string,
  actorUserId: string | null,
  note?: string | null,
): Promise<void> {
  await db.insert(bloodTestOrderEvent).values({ orderId, kind, actorUserId, note: note?.trim() || null });
}

const stillWaiting = (id: string) => and(eq(bloodTestOrder.id, id), eq(bloodTestOrder.status, BloodTestStatus.ORDERED));

/** Book (or move) the sample collection, and say who takes it. */
export async function bookCollection(
  db: Db,
  id: string,
  input: { mode: CollectionMode; at: Date; address?: string | null; technicianUserId?: string | null; actorUserId: string | null },
): Promise<void> {
  if (input.mode === "home" && !input.address?.trim()) throw new Error("A home collection needs the address.");
  if (Number.isNaN(input.at.getTime())) throw new Error("Pick a date and time.");
  const [row] = await db
    .update(bloodTestOrder)
    .set({
      collectionMode: input.mode,
      scheduledAt: input.at,
      collectionAddress: input.mode === "home" ? input.address!.trim() : null,
      technicianUserId: input.technicianUserId || null,
      // A new booking starts the visit again.
      onTheWayAt: null,
      updatedAt: new Date(),
    })
    .where(stillWaiting(id))
    .returning({ id: bloodTestOrder.id });
  if (!row) throw new Error("Only an order still waiting for its sample can be booked.");
  const when = input.at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  await recordOrderEvent(db, id, "booked", input.actorUserId, `${input.mode === "home" ? "Home" : "Centre"} · ${when}`);
}

/** The technician has set out. */
export async function markOnTheWay(db: Db, id: string, actorUserId: string | null): Promise<void> {
  const [row] = await db
    .update(bloodTestOrder)
    .set({ onTheWayAt: new Date(), updatedAt: new Date() })
    .where(and(stillWaiting(id), isNotNull(bloodTestOrder.scheduledAt)))
    .returning({ id: bloodTestOrder.id });
  if (!row) throw new Error("This visit is not booked, or the sample is already taken.");
  await recordOrderEvent(db, id, "on_the_way", actorUserId);
}

/** The sample is taken — the kit's unique code is what ties the tubes to this order. */
export async function markCollected(db: Db, id: string, input: { kitCode: string; actorUserId: string | null }): Promise<void> {
  const kitCode = input.kitCode.trim().toUpperCase();
  if (!kitCode) throw new Error("Enter the kit code.");
  const [taken] = await db
    .select({ id: bloodTestOrder.id })
    .from(bloodTestOrder)
    .where(and(eq(bloodTestOrder.kitCode, kitCode), ne(bloodTestOrder.id, id)))
    .limit(1);
  if (taken) throw new Error(`Kit ${kitCode} is already used on another order — check the code on the kit.`);
  const [row] = await db
    .update(bloodTestOrder)
    .set({ status: BloodTestStatus.COLLECTED, collectedOn: clinicToday(), kitCode, updatedAt: new Date() })
    .where(stillWaiting(id))
    .returning({ id: bloodTestOrder.id });
  if (!row) throw new Error("This order is not waiting for its sample.");
  await recordOrderEvent(db, id, "collected", input.actorUserId, `Kit ${kitCode}`);
}

/** The visit happened but no sample: back to be booked again, with why. */
export async function markNotCollected(db: Db, id: string, input: { reason: string; actorUserId: string | null }): Promise<void> {
  if (!input.reason.trim()) throw new Error("Say why the sample was not taken.");
  const [row] = await db
    .update(bloodTestOrder)
    .set({ scheduledAt: null, onTheWayAt: null, updatedAt: new Date() })
    .where(stillWaiting(id))
    .returning({ id: bloodTestOrder.id });
  if (!row) throw new Error("This order is not waiting for its sample.");
  await recordOrderEvent(db, id, "not_collected", input.actorUserId, input.reason);
}

/** Handed to the outside lab that runs the test. */
export async function markSentToLab(
  db: Db,
  id: string,
  input: { lab: string; expectedOn?: string | null; actorUserId: string | null },
): Promise<void> {
  if (!input.lab.trim()) throw new Error("Which lab is it going to?");
  const expected = input.expectedOn && /^\d{4}-\d{2}-\d{2}$/.test(input.expectedOn) ? input.expectedOn : null;
  const [row] = await db
    .update(bloodTestOrder)
    .set({ sentToLabAt: new Date(), externalLab: input.lab.trim(), expectedReportOn: expected, updatedAt: new Date() })
    .where(and(eq(bloodTestOrder.id, id), eq(bloodTestOrder.status, BloodTestStatus.COLLECTED)))
    .returning({ id: bloodTestOrder.id });
  if (!row) throw new Error("Only a collected sample can be sent to the lab.");
  await recordOrderEvent(db, id, "sent_to_lab", input.actorUserId, `${input.lab.trim()}${expected ? ` · report by ${expected}` : ""}`);
}

export async function setLabNote(db: Db, id: string, note: string | null): Promise<void> {
  await db
    .update(bloodTestOrder)
    .set({ labNote: note?.trim() || null, updatedAt: new Date() })
    .where(eq(bloodTestOrder.id, id));
}

// ------------------------------------------------------------------ field

/** Everyone who can be sent to take a sample: roles granted Field visits. */
export async function listTechnicians(db: Db): Promise<{ id: string; name: string }[]> {
  const roles = (
    await db.select({ role: rolePermission.role }).from(rolePermission).where(eq(rolePermission.permission, "clinic.field"))
  ).map((r) => r.role);
  if (!roles.length) return [];
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(inArray(user.role, roles), eq(user.banned, false)))
    .orderBy(asc(user.name));
}

/**
 * A field technician's own visits: everything assigned to them still to be
 * collected, and what they collected today.
 */
export async function fieldVisits(db: Db, technicianUserId: string): Promise<LabOrderRow[]> {
  const today = clinicToday();
  const rows = await baseQuery(db)
    .where(
      and(
        eq(bloodTestOrder.technicianUserId, technicianUserId),
        or(
          eq(bloodTestOrder.status, BloodTestStatus.ORDERED),
          and(eq(bloodTestOrder.status, BloodTestStatus.COLLECTED), eq(bloodTestOrder.collectedOn, today)),
        ),
      ),
    )
    .orderBy(asc(bloodTestOrder.scheduledAt))
    .limit(200);
  return rows.map(toRow);
}

/** Whether this order is assigned to this technician — the field page acts only on its own. */
export async function isAssignedTo(db: Db, orderId: string, technicianUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bloodTestOrder.id })
    .from(bloodTestOrder)
    .where(and(eq(bloodTestOrder.id, orderId), eq(bloodTestOrder.technicianUserId, technicianUserId)))
    .limit(1);
  return Boolean(row);
}

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  contact,
  medicine,
  medicineComponent,
  planEnrollment,
  planEnrollmentItem,
  planSitting,
  stockMovement,
  therapyBooking,
  user,
} from "./schema";

const CLINIC_UTC_OFFSET_MS = 330 * 60 * 1000;
import type * as schema from "./schema";
import { CLINIC_UTC_OFFSET, clinicDate } from "./availability-service";
import { clinicMoment } from "./clinic-time";

type Database = NodePgDatabase<typeof schema>;

/**
 * What is on the shelf, what went out, and what tomorrow needs.
 *
 * On-hand is always the SUM of stock_movement. There is no stock column to
 * increment, because a counter and a movement history disagree the first time
 * an update is missed or applied twice — and the disagreement is silent until a
 * physical count months later, with no way to say which entry was wrong.
 *
 * Quantities are floating point rather than integers, unlike money. Stock is
 * measured as well as counted — half a sachet, 2.5 ml — and rounding those to
 * whole units would misreport every consumption. Nothing here compares a
 * quantity for exact equality; the only test is "is it at or below the reorder
 * level", where a rounding error of 1e-12 changes nothing.
 */

export const MovementKind = {
  /** The count the clinic started from. One per medicine, normally. */
  OPENING: "opening",
  PURCHASE: "purchase",
  /** Handed to a patient to take away. */
  DISPENSE: "dispense",
  /** Used during a therapy session at the clinic. */
  CONSUMPTION: "consumption",
  /** A correction after a physical count. */
  ADJUSTMENT: "adjustment",
  RETURN: "return",
  EXPIRY: "expiry",
} as const;

export type MovementKind = (typeof MovementKind)[keyof typeof MovementKind];

export const MOVEMENT_KINDS: { value: MovementKind; label: string; direction: "in" | "out" }[] = [
  { value: "opening", label: "Opening stock", direction: "in" },
  { value: "purchase", label: "Purchase", direction: "in" },
  { value: "return", label: "Return", direction: "in" },
  { value: "dispense", label: "Dispensed to a patient", direction: "out" },
  { value: "consumption", label: "Used in therapy", direction: "out" },
  { value: "expiry", label: "Expired", direction: "out" },
  // Adjustment is the only one that can go either way — a count finds more or
  // less than the ledger says, and forcing it to one direction would mean
  // entering "found 3 extra" as a purchase that never happened.
  { value: "adjustment", label: "Adjustment after a count", direction: "in" },
];

export function isMovementKind(v: unknown): v is MovementKind {
  return MOVEMENT_KINDS.some((k) => k.value === v);
}

/** Which way a kind points, before any sign the caller supplies. */
export function directionOf(kind: string): "in" | "out" {
  return MOVEMENT_KINDS.find((k) => k.value === kind)?.direction ?? "out";
}

export const MEDICINE_UNITS = [
  "piece",
  "tablet",
  "capsule",
  "sachet",
  "bottle",
  "tube",
  "ml",
  "gram",
];

export interface StockLevel {
  id: string;
  /** A combo. Holds no stock of its own — its components do. */
  isKit: boolean;
  /** What a kit expands to. Empty for a plain medicine. */
  components: { medicineId: string; name: string; quantity: number }[];
  name: string;
  sku: string | null;
  unit: string;
  perSittingQty: number | null;
  reorderLevel: number;
  /** Counter price of one unit, paise. 0 = not set. */
  rateInPaise: number;
  isActive: boolean;
  onHand: number;
  /** True at or below the reorder level, when one is set. */
  low: boolean;
  /** Negative on hand — the ledger says more went out than ever came in. */
  negative: boolean;
}

/**
 * Every medicine with its balance at one clinic, computed from that clinic's
 * ledger. The list of medicines is shared; the shelf is not.
 */
export async function stockLevels(db: Database, clinicId: string): Promise<StockLevel[]> {
  const rows = await db
    .select({
      id: medicine.id,
      name: medicine.name,
      sku: medicine.sku,
      unit: medicine.unit,
      perSittingQty: medicine.perSittingQty,
      reorderLevel: medicine.reorderLevel,
      rateInPaise: medicine.rateInPaise,
      isActive: medicine.isActive,
      isKit: medicine.isKit,
      onHand: sql<number>`coalesce(sum(${stockMovement.quantity}), 0)::double precision`,
    })
    .from(medicine)
    // In the join, not the WHERE: a medicine this clinic has never stocked
    // still belongs on the list, at zero.
    .leftJoin(
      stockMovement,
      and(eq(stockMovement.medicineId, medicine.id), eq(stockMovement.clinicId, clinicId)),
    )
    .groupBy(medicine.id)
    .orderBy(asc(medicine.name));

  // What every combo expands to, so the page can show it and the caller does
  // not have to ask again per row.
  const parts = await db
    .select({
      kitId: medicineComponent.kitId,
      componentId: medicineComponent.componentId,
      quantity: medicineComponent.quantity,
      name: medicine.name,
    })
    .from(medicineComponent)
    .innerJoin(medicine, eq(medicine.id, medicineComponent.componentId));

  return rows.map((r) => ({
    ...r,
    components: parts
      .filter((p) => p.kitId === r.id)
      .map((p) => ({ medicineId: p.componentId, name: p.name, quantity: p.quantity })),
    onHand: Number(r.onHand),
    low: !r.isKit && r.reorderLevel > 0 && Number(r.onHand) <= r.reorderLevel,
    // Worth surfacing rather than clamping to zero: it means a movement was
    // recorded that never physically happened, or an opening count is missing.
    negative: !r.isKit && Number(r.onHand) < 0,
  }));
}

export interface RecordMovementParams {
  /** Whose shelf it comes off or goes onto. Each clinic counts its own stock. */
  clinicId: string;
  medicineId: string;
  kind: string;
  /** Always positive from the caller; the direction comes from the kind. */
  quantity: number;
  /** Adjustment only: true to take stock away rather than add it. */
  negative?: boolean;
  contactId?: string | null;
  enrollmentId?: string | null;
  sittingId?: string | null;
  batchNo?: string | null;
  expiresOn?: string | null;
  unitCostInPaise?: number | null;
  note?: string | null;
  occurredAt?: Date;
  actorId?: string | null;
}

/**
 * One movement, signed by its kind.
 *
 * The caller passes a plain positive number and says what kind of movement it
 * is; the sign is derived. Asking a storeroom to type "-25" is how a purchase
 * gets entered as a loss.
 */
export async function recordMovement(db: Database, params: RecordMovementParams) {
  if (!params.clinicId) throw new Error("Pick which clinic's stock this is.");
  if (!isMovementKind(params.kind)) throw new Error("Pick what kind of movement this is.");
  if (!Number.isFinite(params.quantity) || params.quantity <= 0) {
    throw new Error("Enter a quantity greater than zero.");
  }

  // A combo has no shelf of its own. Allowing one to be stocked would create a
  // second count of the same tins running alongside the real one — the combo
  // says 10, the medicines inside it say 4, and nothing can say which is right.
  const [item] = await db
    .select({ isKit: medicine.isKit, name: medicine.name })
    .from(medicine)
    .where(eq(medicine.id, params.medicineId))
    .limit(1);

  if (!item) throw new Error("That medicine no longer exists.");
  if (item.isKit) {
    throw new Error(
      `${item.name} is a combo — stock is counted on each medicine it is made of, not on the combo itself.`,
    );
  }

  const out =
    params.kind === MovementKind.ADJUSTMENT
      ? params.negative === true
      : directionOf(params.kind) === "out";

  const [created] = await db
    .insert(stockMovement)
    .values({
      clinicId: params.clinicId,
      medicineId: params.medicineId,
      kind: params.kind,
      quantity: out ? -Math.abs(params.quantity) : Math.abs(params.quantity),
      contactId: params.contactId ?? null,
      enrollmentId: params.enrollmentId ?? null,
      sittingId: params.sittingId ?? null,
      batchNo: params.batchNo?.trim() || null,
      expiresOn: params.expiresOn || null,
      unitCostInPaise: params.unitCostInPaise ?? null,
      note: params.note?.trim() || null,
      occurredAt: params.occurredAt ?? new Date(),
      actorUserId: params.actorId ?? null,
    })
    .returning();

  return created!;
}

/**
 * The clinic whose shelf a course draws on: the one the course was enrolled
 * at, or the patient's own clinic for an older course that never recorded one.
 * Null when neither is known.
 */
export async function enrollmentClinicId(
  db: Database,
  enrollmentId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ course: planEnrollment.clinicId, patient: contact.clinicId })
    .from(planEnrollment)
    .leftJoin(contact, eq(contact.id, planEnrollment.contactId))
    .where(eq(planEnrollment.id, enrollmentId))
    .limit(1);
  return row?.course ?? row?.patient ?? null;
}

export interface ConsumableLine {
  medicineId: string;
  name: string;
  unit: string;
  perSittingQty: number;
}

/**
 * The medicines a set of plan lines actually draws on, per session.
 *
 * A plan line naming a combo expands to what the combo is made of: the patient
 * is handed "(2 BHT + LL + NPF-1) Combo", but the storeroom loses BHT, LL and
 * NPF-1 off three shelves. A line naming a plain medicine is itself.
 *
 * The per-session amount lives on the LEAF medicine, not on the combo, and the
 * combo quantity does not multiply it. Those are two different facts: how many
 * tins a combo box contains, and how much of one tin a therapy session uses.
 *
 * Shared by consumption and the forecast on purpose. Two expansions of "what
 * is in this combo" is how the shelf and the order list start disagreeing.
 */
export async function expandToConsumables(
  db: Database,
  medicineIds: string[],
): Promise<Map<string, ConsumableLine[]>> {
  const ids = [...new Set(medicineIds.filter(Boolean))];
  if (!ids.length) return new Map();

  const named = await db
    .select({
      id: medicine.id,
      name: medicine.name,
      unit: medicine.unit,
      isKit: medicine.isKit,
      perSittingQty: medicine.perSittingQty,
    })
    .from(medicine)
    .where(inArray(medicine.id, ids));

  const kitIds = named.filter((m) => m.isKit).map((m) => m.id);
  const parts = kitIds.length
    ? await db
        .select({
          kitId: medicineComponent.kitId,
          id: medicine.id,
          name: medicine.name,
          unit: medicine.unit,
          perSittingQty: medicine.perSittingQty,
        })
        .from(medicineComponent)
        .innerJoin(medicine, eq(medicine.id, medicineComponent.componentId))
        .where(inArray(medicineComponent.kitId, kitIds))
    : [];

  const out = new Map<string, ConsumableLine[]>();

  for (const m of named) {
    const lines: ConsumableLine[] = [];

    if (m.isKit) {
      for (const p of parts.filter((x) => x.kitId === m.id)) {
        if (!p.perSittingQty || p.perSittingQty <= 0) continue;
        lines.push({ medicineId: p.id, name: p.name, unit: p.unit, perSittingQty: p.perSittingQty });
      }
    } else if (m.perSittingQty && m.perSittingQty > 0) {
      lines.push({ medicineId: m.id, name: m.name, unit: m.unit, perSittingQty: m.perSittingQty });
    }

    out.set(m.id, lines);
  }

  return out;
}

/**
 * Take stock for a therapy session that happened at the clinic.
 *
 * Only in-clinic sittings draw on clinic stock. An at-home day uses the pack
 * the patient was already given, and taking it from the shelf again would count
 * the same medicine twice.
 *
 * Only medicines with a per-sitting quantity are consumed. Everything else is
 * dispensed as a pack, and a medicine with no number set is left alone rather
 * than guessed at.
 *
 * Idempotent by the unique index on (sitting, medicine): re-marking a day done
 * after a correction cannot draw the stock down twice.
 */
export async function consumeForSitting(
  db: Database,
  params: {
    sittingId: string;
    actorId?: string | null;
    /** The clinic the session happened at, when the caller knows it better than the course does. */
    clinicId?: string | null;
  },
): Promise<{ consumed: { medicineId: string; quantity: number }[] }> {
  const [sitting] = await db
    .select()
    .from(planSitting)
    .where(eq(planSitting.id, params.sittingId))
    .limit(1);

  // A free sitting takes nothing: what the patient needs then is sold apart.
  if (!sitting || sitting.mode !== "in_clinic" || sitting.isFree) return { consumed: [] };

  // Off the shelf of the clinic the session happened at — the caller's when it
  // says, otherwise the clinic running the course. A course with no clinic at
  // all has no shelf to take from; guessing one would short another clinic's
  // count.
  const clinicId = params.clinicId || (await enrollmentClinicId(db, sitting.enrollmentId));
  if (!clinicId) return { consumed: [] };

  // What this patient's package includes. A combo line expands to the tins it
  // is made of — the storeroom loses those, not the combo.
  const lines = await db
    .select({ medicineId: planEnrollmentItem.medicineId })
    .from(planEnrollmentItem)
    .where(eq(planEnrollmentItem.enrollmentId, sitting.enrollmentId));

  const expanded = await expandToConsumables(
    db,
    lines.map((l) => l.medicineId).filter((v): v is string => Boolean(v)),
  );

  // A medicine reached through two different combos is used once per session,
  // not twice — the session is the unit, not the packaging.
  const perMedicine = new Map<string, number>();
  for (const set of expanded.values()) {
    for (const line of set) perMedicine.set(line.medicineId, line.perSittingQty);
  }

  const consumed: { medicineId: string; quantity: number }[] = [];

  for (const [medicineId, quantity] of perMedicine) {
    try {
      await recordMovement(db, {
        clinicId,
        medicineId,
        kind: MovementKind.CONSUMPTION,
        quantity,
        contactId: sitting.contactId,
        enrollmentId: sitting.enrollmentId,
        sittingId: sitting.id,
        note: `Day ${sitting.dayNumber}`,
        // Off the shelf on the day of the therapy, also when written up later.
        occurredAt: clinicMoment(sitting.plannedDate),
        actorId: params.actorId ?? null,
      });
      consumed.push({ medicineId, quantity });
    } catch {
      // The unique index refusing a second consumption for the same day is the
      // rule working, not a failure worth propagating into the log sheet.
    }
  }
  return { consumed };
}

export interface ForecastRow {
  medicineId: string;
  name: string;
  unit: string;
  onHand: number;
  perSittingQty: number;
  /** Sittings booked in the window that use this medicine. */
  sittings: number;
  required: number;
  /** onHand − required. Negative means the shelf runs out. */
  afterwards: number;
  short: boolean;
}

/**
 * What the days ahead will take off the shelf.
 *
 * Counts only in-clinic sittings on active courses, because those are the ones
 * that draw on clinic stock — an at-home day uses a pack already handed over.
 * Cancelled courses and days already answered are excluded: what is being asked
 * is what is still to come.
 *
 * One clinic at a time: its own calendar against its own shelf. Another
 * clinic's bookings cannot empty this one's storeroom.
 */
export async function forecast(
  db: Database,
  params: { clinicId: string; from?: string; days?: number },
): Promise<{ from: string; to: string; rows: ForecastRow[] }> {
  const from = params.from ?? clinicDate(0);
  const span = params.days ?? 7;
  const to = clinicDate(span, new Date(`${from}T00:00:00Z`));

  // Hours booked on the therapy calendar for live courses, and which plan
  // line each carries. Sittings are no longer written ahead, so the bookings
  // are what is still to come. A combo line is expanded below.
  const windowStart = new Date(Date.parse(`${from}T00:00:00Z`) - CLINIC_UTC_OFFSET_MS);
  const windowEnd = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000 - CLINIC_UTC_OFFSET_MS);
  const upcoming = await db
    .select({
      medicineId: planEnrollmentItem.medicineId,
      sittings: sql<number>`count(distinct ${therapyBooking.id})::int`,
    })
    .from(therapyBooking)
    .innerJoin(planEnrollment, eq(planEnrollment.id, therapyBooking.enrollmentId))
    .innerJoin(planEnrollmentItem, eq(planEnrollmentItem.enrollmentId, therapyBooking.enrollmentId))
    .where(
      and(
        gte(therapyBooking.startsAt, windowStart),
        lt(therapyBooking.startsAt, windowEnd),
        eq(therapyBooking.status, "booked"),
        // The clinic the hour is booked at; the course's for an older booking
        // that did not record one.
        sql`coalesce(${therapyBooking.clinicId}, ${planEnrollment.clinicId}) = ${params.clinicId}`,
        eq(planEnrollment.status, "active"),
        ne(planEnrollmentItem.kind, "treatment"),
      ),
    )
    .groupBy(planEnrollmentItem.medicineId);

  const expanded = await expandToConsumables(
    db,
    upcoming.map((u) => u.medicineId).filter((v): v is string => Boolean(v)),
  );

  const levels = await stockLevels(db, params.clinicId);
  const byId = new Map(levels.map((l) => [l.id, l]));

  // Sessions, not lines: a medicine reached through two combos on the same
  // course is used once per session. Summed across patients.
  const sessionsPer = new Map<string, number>();
  for (const row of upcoming) {
    if (!row.medicineId) continue;
    for (const line of expanded.get(row.medicineId) ?? []) {
      sessionsPer.set(line.medicineId, (sessionsPer.get(line.medicineId) ?? 0) + row.sittings);
    }
  }

  const rows: ForecastRow[] = [];
  for (const [medicineId, sittings] of sessionsPer) {
    const level = byId.get(medicineId);
    if (!level?.perSittingQty || level.perSittingQty <= 0) continue;

    const required = sittings * level.perSittingQty;
    rows.push({
      medicineId: level.id,
      name: level.name,
      unit: level.unit,
      onHand: level.onHand,
      perSittingQty: level.perSittingQty,
      sittings,
      required,
      afterwards: level.onHand - required,
      short: level.onHand < required,
    });
  }
  return { from, to, rows: rows.sort((a, b) => a.afterwards - b.afterwards) };
}

/** One medicine's movements at one clinic, newest first — the audit trail behind its balance. */
export async function movementsFor(
  db: Database,
  clinicId: string,
  medicineId: string,
  limit = 100,
) {
  return db
    .select()
    .from(stockMovement)
    .where(and(eq(stockMovement.medicineId, medicineId), eq(stockMovement.clinicId, clinicId)))
    .orderBy(desc(stockMovement.occurredAt))
    .limit(limit);
}

/** Which of a clinic's patients are currently on a given medicine — "who has this". */
export async function patientsOnMedicine(db: Database, clinicId: string, medicineId: string) {
  return db
    .select({
      contactId: planEnrollment.contactId,
      enrollmentId: planEnrollment.id,
      planName: planEnrollment.planName,
      status: planEnrollment.status,
      quantity: planEnrollmentItem.quantity,
    })
    .from(planEnrollmentItem)
    .innerJoin(planEnrollment, eq(planEnrollment.id, planEnrollmentItem.enrollmentId))
    .leftJoin(contact, eq(contact.id, planEnrollment.contactId))
    .where(
      and(
        eq(planEnrollmentItem.medicineId, medicineId),
        ne(planEnrollment.status, "cancelled"),
        // The course's clinic, or the patient's for a course that never recorded one.
        sql`coalesce(${planEnrollment.clinicId}, ${contact.clinicId}) = ${clinicId}`,
      ),
    );
}

/* ------------------------------------------------------------------ *
 * History and reports
 *
 * Both read the same ledger the balances are computed from, so a number
 * on the report and a row in the history can never disagree — there is
 * only one record of what happened.
 * ------------------------------------------------------------------ */

/** A clinic-local day turned into the instant it starts, +05:30. */
function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00${CLINIC_UTC_OFFSET}`);
}

/** The instant a clinic-local day ends, exclusive. */
function dayEnd(date: string): Date {
  const d = dayStart(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export interface HistoryFilters {
  medicineId?: string | null;
  kind?: string | null;
  /** Clinic dates, inclusive at both ends. */
  from?: string | null;
  to?: string | null;
  /** Matches a batch number, a note, a medicine or a patient. */
  search?: string | null;
  limit?: number;
  offset?: number;
}

export interface HistoryRow {
  id: string;
  medicineId: string;
  medicineName: string;
  unit: string;
  kind: string;
  /** Signed, as stored: positive in, negative out. */
  quantity: number;
  batchNo: string | null;
  expiresOn: string | null;
  unitCostInPaise: number | null;
  note: string | null;
  contactId: string | null;
  contactName: string | null;
  sittingId: string | null;
  actorName: string | null;
  occurredAt: Date;
}

/**
 * Every movement ever recorded, newest first, filtered and paged.
 *
 * Deliberately not capped to a period by default: "where did forty sachets go"
 * is a question asked months later, and a page that silently holds only the
 * last week cannot answer it.
 */
export async function movementHistory(
  db: Database,
  clinicId: string,
  filters: HistoryFilters = {},
): Promise<{ rows: HistoryRow[]; total: number; limit: number; offset: number }> {
  const limit = Math.min(500, Math.max(1, filters.limit ?? 100));
  const offset = Math.max(0, filters.offset ?? 0);

  // Always this clinic's ledger — never an option a filter can drop.
  const clauses = [eq(stockMovement.clinicId, clinicId)];
  if (filters.medicineId) clauses.push(eq(stockMovement.medicineId, filters.medicineId));
  if (filters.kind && isMovementKind(filters.kind)) {
    clauses.push(eq(stockMovement.kind, filters.kind));
  }
  if (filters.from) clauses.push(gte(stockMovement.occurredAt, dayStart(filters.from)));
  if (filters.to) clauses.push(lt(stockMovement.occurredAt, dayEnd(filters.to)));

  const search = filters.search?.trim();
  if (search) {
    const like = `%${search}%`;
    clauses.push(
      or(
        ilike(stockMovement.batchNo, like),
        ilike(stockMovement.note, like),
        ilike(medicine.name, like),
        ilike(contact.name, like),
      )!,
    );
  }

  const where = and(...clauses);

  const rows = await db
    .select({
      id: stockMovement.id,
      medicineId: stockMovement.medicineId,
      medicineName: medicine.name,
      unit: medicine.unit,
      kind: stockMovement.kind,
      quantity: stockMovement.quantity,
      batchNo: stockMovement.batchNo,
      expiresOn: stockMovement.expiresOn,
      unitCostInPaise: stockMovement.unitCostInPaise,
      note: stockMovement.note,
      contactId: stockMovement.contactId,
      contactName: contact.name,
      sittingId: stockMovement.sittingId,
      actorName: user.name,
      occurredAt: stockMovement.occurredAt,
    })
    .from(stockMovement)
    .innerJoin(medicine, eq(medicine.id, stockMovement.medicineId))
    .leftJoin(contact, eq(contact.id, stockMovement.contactId))
    .leftJoin(user, eq(user.id, stockMovement.actorUserId))
    .where(where)
    .orderBy(desc(stockMovement.occurredAt))
    .limit(limit)
    .offset(offset);

  // Counted through the same joins, because the search filters on joined columns.
  const [counted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(stockMovement)
    .innerJoin(medicine, eq(medicine.id, stockMovement.medicineId))
    .leftJoin(contact, eq(contact.id, stockMovement.contactId))
    .where(where);

  return { rows, total: counted?.total ?? 0, limit, offset };
}

export interface ReportMedicineRow {
  medicineId: string;
  name: string;
  unit: string;
  /** Everything that came in during the period. */
  inQty: number;
  /** Everything that went out, as a positive number. */
  outQty: number;
  /** Used in therapy. The number that answers "how fast do we burn it". */
  consumedQty: number;
  /** Handed to patients to take away. */
  dispensedQty: number;
  purchasedQty: number;
  purchaseValueInPaise: number;
  /** Balance today — not at the end of the period. */
  onHand: number;
  reorderLevel: number;
  low: boolean;
  /** What a unit last cost, from the most recent movement that named a price. */
  lastUnitCostInPaise: number | null;
  /** onHand × last known unit cost. Null when nothing was ever priced. */
  valueInPaise: number | null;
  /** Days of cover at this period's own rate. Null when it was not used at all. */
  daysOfCover: number | null;
}

export interface StockReport {
  from: string;
  to: string;
  days: number;
  medicines: ReportMedicineRow[];
  byKind: {
    kind: string;
    label: string;
    direction: "in" | "out";
    quantity: number;
    movements: number;
  }[];
  /** Consumption per clinic day, for the trend. */
  daily: { date: string; consumed: number; received: number }[];
  totals: {
    movements: number;
    inQty: number;
    outQty: number;
    purchaseValueInPaise: number;
    /** Value on the shelf right now, at last known unit cost. */
    stockValueInPaise: number;
    priced: number;
    unpriced: number;
  };
  /** Batches carrying an expiry, soonest first. */
  expiring: {
    medicineId: string;
    name: string;
    unit: string;
    batchNo: string;
    expiresOn: string;
    quantity: number;
    daysLeft: number;
  }[];
}

/**
 * What the storeroom did over a period.
 *
 * Quantities are for the period; on-hand and value are for today. Mixing the
 * two would make the more natural-looking report and the wrong one — "you used
 * 40 last month" and "you have 12 now" are both true and neither is the other.
 *
 * Value is at the last price actually paid, not an average, and a medicine that
 * was never bought at a recorded price is left unpriced rather than valued at
 * zero. A zero would quietly drag the total down while looking like a real
 * number, which is worse than an honest gap.
 *
 * Everything here is one clinic's storeroom, prices included: what one clinic
 * paid last says nothing about what the other's tins are worth.
 */
export async function stockReport(
  db: Database,
  params: { clinicId: string; from?: string; to?: string },
): Promise<StockReport> {
  const { clinicId } = params;
  const to = params.to ?? clinicDate(0);
  const from = params.from ?? clinicDate(-29, new Date(`${to}T00:00:00Z`));
  const days = Math.max(
    1,
    Math.round((dayStart(to).getTime() - dayStart(from).getTime()) / 86_400_000) + 1,
  );

  const window = and(
    eq(stockMovement.clinicId, clinicId),
    gte(stockMovement.occurredAt, dayStart(from)),
    lt(stockMovement.occurredAt, dayEnd(to)),
  );

  // Totals per medicine per kind, in one pass.
  const grouped = await db
    .select({
      medicineId: stockMovement.medicineId,
      kind: stockMovement.kind,
      quantity: sql<number>`coalesce(sum(${stockMovement.quantity}), 0)::double precision`,
      movements: sql<number>`count(*)::int`,
      value: sql<number>`coalesce(sum(abs(${stockMovement.quantity}) * coalesce(${stockMovement.unitCostInPaise}, 0)), 0)::double precision`,
    })
    .from(stockMovement)
    .where(window)
    .groupBy(stockMovement.medicineId, stockMovement.kind);

  // The last price actually paid, per medicine. DISTINCT ON is the shortest
  // correct way to say "the newest row per group" in Postgres.
  const priced = await db.execute<{ medicine_id: string; unit_cost_in_paise: number }>(sql`
    select distinct on (medicine_id) medicine_id, unit_cost_in_paise
    from stock_movement
    where unit_cost_in_paise is not null and clinic_id = ${clinicId}
    order by medicine_id, occurred_at desc
  `);
  const lastCost = new Map<string, number>();
  for (const row of priced.rows) lastCost.set(row.medicine_id, Number(row.unit_cost_in_paise));

  const levels = await stockLevels(db, clinicId);
  const medicines: ReportMedicineRow[] = [];

  for (const level of levels) {
    // A combo has no shelf, so it has no report line either.
    if (level.isKit) continue;

    const mine = grouped.filter((g) => g.medicineId === level.id);
    const of = (kind: string) => Math.abs(Number(mine.find((g) => g.kind === kind)?.quantity ?? 0));

    const inQty = mine
      .filter((g) => Number(g.quantity) > 0)
      .reduce((sum, g) => sum + Number(g.quantity), 0);
    const outQty = mine
      .filter((g) => Number(g.quantity) < 0)
      .reduce((sum, g) => sum - Number(g.quantity), 0);

    // Nothing happened and nothing is held: a row of zeroes tells no one
    // anything and pushes the rows that matter off the screen.
    if (inQty === 0 && outQty === 0 && level.onHand === 0) continue;

    const consumedQty = of("consumption");
    const cost = lastCost.get(level.id) ?? null;
    const perDay = consumedQty / days;

    medicines.push({
      medicineId: level.id,
      name: level.name,
      unit: level.unit,
      inQty,
      outQty,
      consumedQty,
      dispensedQty: of("dispense"),
      purchasedQty: of("purchase"),
      purchaseValueInPaise: Math.round(
        Number(mine.find((g) => g.kind === "purchase")?.value ?? 0),
      ),
      onHand: level.onHand,
      reorderLevel: level.reorderLevel,
      low: level.low,
      lastUnitCostInPaise: cost,
      valueInPaise: cost === null ? null : Math.round(level.onHand * cost),
      daysOfCover: perDay > 0 ? Math.floor(level.onHand / perDay) : null,
    });
  }

  medicines.sort((a, b) => b.consumedQty - a.consumedQty || a.name.localeCompare(b.name));

  const byKind = MOVEMENT_KINDS.map((k) => {
    const rows = grouped.filter((g) => g.kind === k.value);
    return {
      kind: k.value,
      label: k.label,
      direction: k.direction,
      quantity: rows.reduce((sum, r) => sum + Math.abs(Number(r.quantity)), 0),
      movements: rows.reduce((sum, r) => sum + Number(r.movements), 0),
    };
  }).filter((k) => k.movements > 0);

  // Bucketed per clinic day, not per UTC day — a 9pm consumption belongs to the
  // day the clinic was actually open, not to tomorrow.
  const series = await db.execute<{ day: string; consumed: number; received: number }>(sql`
    select
      to_char((occurred_at at time zone 'UTC') + interval '5 hours 30 minutes', 'YYYY-MM-DD') as day,
      coalesce(sum(case when kind = 'consumption' then abs(quantity) else 0 end), 0)::double precision as consumed,
      coalesce(sum(case when quantity > 0 then quantity else 0 end), 0)::double precision as received
    from stock_movement
    where clinic_id = ${clinicId} and occurred_at >= ${dayStart(from)} and occurred_at < ${dayEnd(to)}
    group by 1
    order by 1
  `);
  const byDay = new Map(
    series.rows.map((r) => [r.day, { consumed: Number(r.consumed), received: Number(r.received) }]),
  );

  const daily: StockReport["daily"] = [];
  for (let i = 0; i < days; i++) {
    const date = clinicDate(i, new Date(`${from}T00:00:00Z`));
    const found = byDay.get(date);
    daily.push({ date, consumed: found?.consumed ?? 0, received: found?.received ?? 0 });
  }

  // Batch balances count only movements carrying that batch number, which the
  // page says out loud — an untagged consumption cannot be attributed to one.
  const batches = await db
    .select({
      medicineId: stockMovement.medicineId,
      name: medicine.name,
      unit: medicine.unit,
      batchNo: stockMovement.batchNo,
      expiresOn: sql<string>`min(${stockMovement.expiresOn})`,
      quantity: sql<number>`coalesce(sum(${stockMovement.quantity}), 0)::double precision`,
    })
    .from(stockMovement)
    .innerJoin(medicine, eq(medicine.id, stockMovement.medicineId))
    .where(
      and(
        eq(stockMovement.clinicId, clinicId),
        isNotNull(stockMovement.batchNo),
        isNotNull(stockMovement.expiresOn),
      ),
    )
    .groupBy(stockMovement.medicineId, medicine.name, medicine.unit, stockMovement.batchNo);

  const today = dayStart(clinicDate(0)).getTime();
  const expiring = batches
    .filter((b) => Number(b.quantity) > 0 && Boolean(b.expiresOn))
    .map((b) => ({
      medicineId: b.medicineId,
      name: b.name,
      unit: b.unit,
      batchNo: b.batchNo!,
      expiresOn: b.expiresOn,
      quantity: Number(b.quantity),
      daysLeft: Math.round((dayStart(b.expiresOn).getTime() - today) / 86_400_000),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    from,
    to,
    days,
    medicines,
    byKind,
    daily,
    totals: {
      movements: grouped.reduce((sum, g) => sum + Number(g.movements), 0),
      inQty: medicines.reduce((sum, m) => sum + m.inQty, 0),
      outQty: medicines.reduce((sum, m) => sum + m.outQty, 0),
      purchaseValueInPaise: medicines.reduce((sum, m) => sum + m.purchaseValueInPaise, 0),
      stockValueInPaise: medicines.reduce((sum, m) => sum + (m.valueInPaise ?? 0), 0),
      priced: medicines.filter((m) => m.lastUnitCostInPaise !== null).length,
      unpriced: medicines.filter((m) => m.lastUnitCostInPaise === null).length,
    },
    expiring,
  };
}

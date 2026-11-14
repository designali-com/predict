import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { medicine, planEnrollment, planEnrollmentItem, stockMovement } from "./schema";
import type * as schema from "./schema";
import { enrollmentClinicId, MovementKind, recordMovement } from "./stock-service";
import { clinicMoment, pastClinicDate } from "./clinic-time";

type Database = NodePgDatabase<typeof schema>;

/**
 * Medicine handed out of a patient's package — a box opened at the clinic for
 * their therapy, or taken home. Either way it comes out of what the package
 * allots: an in-station patient with 6 boxes who opens 4 here and takes 2 home
 * has used all 6, and the seventh is a purchase with its own bill (Sell
 * medicine), never a quiet extra on the package.
 *
 * What has been given is the stock that went out against the course, so the
 * package view's Given / Left and the storeroom's count are the same rows.
 */

export const ISSUE_PURPOSES = [
  { value: "clinic", label: "Opened at clinic (therapy)" },
  { value: "home", label: "Taken home" },
] as const;

export type IssuePurpose = (typeof ISSUE_PURPOSES)[number]["value"];

export function isIssuePurpose(v: unknown): v is IssuePurpose {
  return v === "clinic" || v === "home";
}

/** The note on the stock row — how the package view tells the two apart. */
export const ISSUE_NOTE: Record<IssuePurpose, string> = {
  clinic: "Package · opened at clinic",
  home: "Package · taken home",
};

export interface PackageLine {
  medicineId: string;
  name: string;
  unit: string;
  allotted: number;
  given: number;
  left: number;
}

/** Per medicine: what the course allots, what has gone out against it, what is left. */
export async function packageBalance(db: Database, enrollmentId: string): Promise<PackageLine[]> {
  const items = await db
    .select({
      medicineId: planEnrollmentItem.medicineId,
      name: planEnrollmentItem.name,
      quantity: planEnrollmentItem.quantity,
      unit: medicine.unit,
    })
    .from(planEnrollmentItem)
    .leftJoin(medicine, eq(medicine.id, planEnrollmentItem.medicineId))
    .where(and(eq(planEnrollmentItem.enrollmentId, enrollmentId), eq(planEnrollmentItem.kind, "medicine")));

  const out = await db
    .select({
      medicineId: stockMovement.medicineId,
      qty: sql<number>`-sum(${stockMovement.quantity})`.mapWith(Number),
    })
    .from(stockMovement)
    .where(and(eq(stockMovement.enrollmentId, enrollmentId), lt(stockMovement.quantity, 0)))
    .groupBy(stockMovement.medicineId);

  // One row per medicine, even if the course carries it on two lines (an extra).
  const byMedicine = new Map<string, PackageLine>();
  for (const item of items) {
    if (!item.medicineId) continue;
    const row = byMedicine.get(item.medicineId);
    if (row) row.allotted += item.quantity;
    else byMedicine.set(item.medicineId, { medicineId: item.medicineId, name: item.name, unit: item.unit ?? "piece", allotted: item.quantity, given: 0, left: 0 });
  }
  for (const row of byMedicine.values()) {
    row.given = out.find((o) => o.medicineId === row.medicineId)?.qty ?? 0;
    row.left = Math.max(0, row.allotted - row.given);
  }
  return [...byMedicine.values()];
}

export interface IssueLine {
  medicineId: string;
  quantity: number;
  purpose: IssuePurpose;
}

/**
 * Hand medicine out of the package. Refused, whole, if any line asks for more
 * than the package has left — the extra is sold on its own bill instead.
 *
 * `date` is the clinic day it was given (YYYY-MM-DD, default today), so what
 * was handed out earlier — or before the system, for an older patient — is
 * written up under the day it happened. It cannot be in the future, or before
 * the course started.
 */
export async function issueFromPackage(
  db: Database,
  params: { enrollmentId: string; lines: IssueLine[]; date?: string | null; actorId?: string | null },
) {
  const date = pastClinicDate(params.date);
  const lines = params.lines.filter((l) => l.quantity > 0);
  if (!lines.length) throw new Error("Enter how many to give.");
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error("Give whole boxes or pieces — 1 or more.");
    if (!isIssuePurpose(l.purpose)) throw new Error("Say whether it was opened at the clinic or taken home.");
  }

  const [course] = await db.select().from(planEnrollment).where(eq(planEnrollment.id, params.enrollmentId)).limit(1);
  if (!course) throw new Error("That course no longer exists.");
  if (course.status === "prescribed") throw new Error("Start the course first — medicine is issued once it is running.");
  if (course.status === "cancelled") throw new Error("This course was stopped; nothing more is issued from it.");
  if (course.startDate && date < course.startDate) {
    throw new Error(`That is before the course started (${course.startDate}). Change the course start date first if it began earlier.`);
  }
  const occurredAt = clinicMoment(date);

  // Off the shelf of the clinic running the course.
  const clinicId = await enrollmentClinicId(db, course.id);
  if (!clinicId) throw new Error("This course is not on any clinic's books, so there is no shelf to give from.");

  const balance = await packageBalance(db, course.id);
  const wanted = new Map<string, number>();
  for (const l of lines) wanted.set(l.medicineId, (wanted.get(l.medicineId) ?? 0) + l.quantity);
  for (const [medicineId, qty] of wanted) {
    const row = balance.find((b) => b.medicineId === medicineId);
    if (!row) throw new Error("That medicine is not part of this package — sell it instead.");
    if (qty > row.left) {
      throw new Error(
        row.left === 0
          ? `${row.name}: the package has none left. Sell it with Sell medicine.`
          : `${row.name}: only ${row.left} left in the package. Give ${row.left} from it and sell the rest.`,
      );
    }
  }

  const ids = [...wanted.keys()];
  const kits = await db.select({ id: medicine.id, name: medicine.name }).from(medicine).where(and(inArray(medicine.id, ids), eq(medicine.isKit, true)));
  if (kits.length) throw new Error(`${kits[0]!.name} is a combo — this package predates single medicines; ask the admin.`);

  return db.transaction(async (tx) => {
    const t = tx as unknown as Database;
    const written = [];
    for (const l of lines) {
      written.push(
        await recordMovement(t, {
          clinicId,
          medicineId: l.medicineId,
          // Opened here for the therapy is used up; taken home is handed over.
          kind: l.purpose === "clinic" ? MovementKind.CONSUMPTION : MovementKind.DISPENSE,
          quantity: l.quantity,
          contactId: course.contactId,
          enrollmentId: course.id,
          note: ISSUE_NOTE[l.purpose],
          occurredAt,
          actorId: params.actorId ?? null,
        }),
      );
    }
    return written;
  });
}

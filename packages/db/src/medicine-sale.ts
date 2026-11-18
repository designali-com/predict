import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { appointment, contact, medicine, medicineComponent, medicineSale, medicineSaleLine, payment } from "./schema";
import type * as schema from "./schema";
import { PaymentKind, totalPaid } from "./payment";
import { recordPayment } from "./payment-service";
import { MovementKind, recordMovement } from "./stock-service";

import { lineAmounts, type MedicineSaleLine } from "./medicine-bill-math";

type Database = NodePgDatabase<typeof schema>;

export { lineAmounts, type DiscountType, type MedicineSaleLine } from "./medicine-bill-math";

export interface SellMedicineParams {
  /** The visit it was bought at. Null for somebody who came in only to buy. */
  appointmentId?: string | null;
  contactId: string;
  lines: MedicineSaleLine[];
  /** False puts the whole bill on the patient's dues instead of taking money now. */
  payNow?: boolean;
  method?: string;
  reference?: string | null;
  actorId?: string | null;
  /**
   * The clinic selling it — the desk's. The bill and its receipt number are
   * that clinic's, not whichever the patient happens to be on.
   */
  clinicId?: string | null;
}

/**
 * Medicine handed over — at a visit, or over the counter — paid now or owed.
 *
 * Not a course and not an extra line on one. People come in only to buy
 * medicine, and a therapy patient buys more of it between sittings, often on
 * the understanding that it is settled with the course. So the bill is written
 * either way, and money against it is a payment like any other — now, later,
 * or in parts. The shelf loses whatever was handed over at the time it was
 * handed over; a combo has no stock of its own, so its components go out.
 */
export async function sellMedicine(db: Database, params: SellMedicineParams) {
  if (!params.lines.length) throw new Error("Add at least one medicine.");

  const seen = new Set<string>();
  for (const line of params.lines) {
    if (seen.has(line.medicineId)) throw new Error("List each medicine once.");
    seen.add(line.medicineId);
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new Error("Quantity must be at least 1.");
    }
    if (!Number.isInteger(line.rateInPaise) || line.rateInPaise < 0) {
      throw new Error("Rate cannot be negative.");
    }
    if (line.discountType && line.discountType !== "percent" && line.discountType !== "amount") {
      throw new Error("A discount is a % or an amount.");
    }
    const value = Number(line.discountValue ?? 0);
    if (!Number.isFinite(value) || value < 0) throw new Error("A discount cannot be negative.");
    if (line.discountType === "percent" && value > 100) throw new Error("A discount cannot be more than 100%.");
    if (line.discountType === "amount" && Math.round(value * 100) > line.rateInPaise * line.quantity) {
      throw new Error("A discount cannot be more than the line.");
    }
  }

  const amounts = params.lines.map(lineAmounts);
  const grossInPaise = amounts.reduce((sum, a) => sum + a.grossInPaise, 0);
  const discountInPaise = amounts.reduce((sum, a) => sum + a.discountInPaise, 0);
  const totalInPaise = grossInPaise - discountInPaise;
  if (grossInPaise <= 0) throw new Error("Enter what was charged.");

  let clinicId: string | null = null;
  if (params.appointmentId) {
    const [visit] = await db
      .select({ id: appointment.id, contactId: appointment.contactId, clinicId: appointment.clinicId })
      .from(appointment)
      .where(eq(appointment.id, params.appointmentId))
      .limit(1);
    if (!visit) throw new Error("Appointment not found.");
    if (visit.contactId !== params.contactId) {
      throw new Error("This visit belongs to someone else.");
    }
    if (params.clinicId && visit.clinicId && visit.clinicId !== params.clinicId) {
      throw new Error("Appointment not found.");
    }
  }
  const [buyer] = await db.select({ id: contact.id, clinicId: contact.clinicId }).from(contact).where(eq(contact.id, params.contactId)).limit(1);
  if (!buyer) throw new Error("Patient not found.");
  // Somebody on another clinic's books is not this counter's to bill.
  if (params.clinicId && buyer.clinicId && buyer.clinicId !== params.clinicId) {
    throw new Error("Patient not found.");
  }
  // The desk's clinic when it said one; the patient's for a caller that did not.
  clinicId = params.clinicId ?? buyer.clinicId;
  // The medicine comes off that same clinic's shelf, so it has to be one.
  if (!clinicId) throw new Error("Pick which clinic is selling this — stock is counted per clinic.");
  const shelf = clinicId;

  const ids = params.lines.map((line) => line.medicineId);
  const items = await db.select().from(medicine).where(inArray(medicine.id, ids));
  const byId = new Map(items.map((item) => [item.id, item]));

  for (const line of params.lines) {
    const item = byId.get(line.medicineId);
    if (!item) throw new Error("That medicine is not on the list.");
    if (!item.isActive) throw new Error(`${item.name} is no longer sold.`);
  }

  const kitIds = items.filter((item) => item.isKit).map((item) => item.id);
  const parts = kitIds.length
    ? await db.select().from(medicineComponent).where(inArray(medicineComponent.kitId, kitIds))
    : [];

  for (const kitId of kitIds) {
    if (!parts.some((part) => part.kitId === kitId)) {
      const name = byId.get(kitId)?.name ?? "That combo";
      throw new Error(`${name} has no medicines listed inside it, so nothing can come off the shelf.`);
    }
  }

  const note = params.lines
    .map((line) => {
      const name = byId.get(line.medicineId)?.name ?? "Medicine";
      return `${name} × ${line.quantity}`;
    })
    .join(", ");

  return db.transaction(async (tx) => {
    const t = tx as unknown as Database;
    const [sale] = await t
      .insert(medicineSale)
      .values({
        contactId: params.contactId,
        clinicId,
        appointmentId: params.appointmentId || null,
        grossInPaise,
        discountInPaise,
        totalInPaise,
        note,
        soldByUserId: params.actorId ?? null,
      })
      .returning();

    await t.insert(medicineSaleLine).values(
      params.lines.map((line, i) => ({
        saleId: sale!.id,
        medicineId: line.medicineId,
        name: byId.get(line.medicineId)!.name,
        quantity: line.quantity,
        rateInPaise: line.rateInPaise,
        discountType: amounts[i]!.discountInPaise > 0 ? (line.discountType ?? null) : null,
        discountValue: amounts[i]!.discountInPaise > 0 ? Number(line.discountValue) : null,
        discountInPaise: amounts[i]!.discountInPaise,
        amountInPaise: amounts[i]!.amountInPaise,
        sortOrder: (i + 1) * 10,
      })),
    );

    // Nothing to collect on a bill discounted to nothing, and nothing now on
    // one put on the dues.
    const paid =
      params.payNow !== false && totalInPaise > 0
        ? await recordPayment(t, {
            contactId: params.contactId,
            kind: PaymentKind.MEDICINE,
            appointmentId: params.appointmentId || null,
            medicineSaleId: sale!.id,
            amountInPaise: totalInPaise,
            method: params.method,
            reference: params.reference,
            note: discountInPaise > 0 ? `${note} (₹${Math.round(discountInPaise / 100).toLocaleString("en-IN")} off)` : note,
            actorId: params.actorId,
            clinicId,
          })
        : null;

    for (const line of params.lines) {
      const item = byId.get(line.medicineId)!;
      const sold = item.isKit
        ? parts
            .filter((part) => part.kitId === item.id)
            .map((part) => ({
              medicineId: part.componentId,
              quantity: part.quantity * line.quantity,
            }))
        : [{ medicineId: item.id, quantity: line.quantity }];

      for (const out of sold) {
        await recordMovement(t, {
          clinicId: shelf,
          medicineId: out.medicineId,
          kind: MovementKind.DISPENSE,
          quantity: out.quantity,
          contactId: params.contactId,
          note: `Sold: ${item.name}`,
          actorId: params.actorId,
        });
      }
    }

    return { sale: sale!, payment: paid };
  });
}

export interface MedicineBill {
  id: string;
  contactId: string;
  appointmentId: string | null;
  soldAt: string;
  note: string | null;
  grossInPaise: number;
  discountInPaise: number;
  totalInPaise: number;
  paidInPaise: number;
  outstandingInPaise: number;
  voided: boolean;
  lines: {
    name: string;
    quantity: number;
    rateInPaise: number;
    discountType: string | null;
    discountValue: number | null;
    discountInPaise: number;
    amountInPaise: number;
  }[];
}

/** Bills with what has been paid against each, newest first. */
export async function medicineBills(
  db: Database,
  where: { contactId?: string; clinicId?: string; owingOnly?: boolean },
): Promise<MedicineBill[]> {
  const parts = [isNull(medicineSale.voidedAt)];
  if (where.contactId) parts.push(eq(medicineSale.contactId, where.contactId));
  if (where.clinicId) parts.push(eq(medicineSale.clinicId, where.clinicId));
  const sales = await db.select().from(medicineSale).where(and(...parts)).orderBy(desc(medicineSale.soldAt)).limit(500);
  if (!sales.length) return [];
  const ids = sales.map((s) => s.id);
  const [lines, paid] = await Promise.all([
    db.select().from(medicineSaleLine).where(inArray(medicineSaleLine.saleId, ids)).orderBy(medicineSaleLine.sortOrder),
    db.select().from(payment).where(inArray(payment.medicineSaleId, ids)),
  ]);
  const bills = sales.map((s) => {
    const paidInPaise = totalPaid(paid.filter((p) => p.medicineSaleId === s.id));
    return {
      id: s.id,
      contactId: s.contactId,
      appointmentId: s.appointmentId,
      soldAt: s.soldAt.toISOString(),
      note: s.note,
      grossInPaise: s.grossInPaise,
      discountInPaise: s.discountInPaise,
      totalInPaise: s.totalInPaise,
      paidInPaise,
      outstandingInPaise: Math.max(0, s.totalInPaise - paidInPaise),
      voided: false,
      lines: lines
        .filter((l) => l.saleId === s.id)
        .map((l) => ({
          name: l.name,
          quantity: l.quantity,
          rateInPaise: l.rateInPaise,
          discountType: l.discountType,
          discountValue: l.discountValue,
          discountInPaise: l.discountInPaise,
          amountInPaise: l.amountInPaise,
        })),
    };
  });
  return where.owingOnly ? bills.filter((b) => b.outstandingInPaise > 0) : bills;
}

/** Money against a medicine bill left owing — all of it, or part. */
export async function payMedicineBill(
  db: Database,
  params: {
    saleId: string;
    amountInPaise: number;
    method?: string;
    reference?: string | null;
    actorId?: string | null;
    /** The clinic collecting it; the bill's own when left out. */
    clinicId?: string | null;
  },
) {
  const [sale] = await db.select().from(medicineSale).where(eq(medicineSale.id, params.saleId)).limit(1);
  if (!sale || sale.voidedAt) throw new Error("That medicine bill no longer exists.");
  const rows = await db.select().from(payment).where(eq(payment.medicineSaleId, sale.id));
  const outstanding = Math.max(0, sale.totalInPaise - totalPaid(rows));
  if (outstanding <= 0) throw new Error("This medicine bill is already paid.");
  if (params.amountInPaise > outstanding) {
    throw new Error(`Only ₹${Math.round(outstanding / 100).toLocaleString("en-IN")} is owed on this bill.`);
  }
  return recordPayment(db, {
    contactId: sale.contactId,
    kind: PaymentKind.MEDICINE,
    medicineSaleId: sale.id,
    amountInPaise: params.amountInPaise,
    method: params.method,
    reference: params.reference,
    note: `Medicine dues — ${sale.note ?? "medicine"}`,
    actorId: params.actorId,
    clinicId: params.clinicId ?? sale.clinicId,
  });
}

/**
 * Take back a bill entered by mistake. Only one nothing has been paid against —
 * money taken is cancelled as a payment first — and the medicine goes back on
 * the shelf.
 */
export async function cancelMedicineBill(db: Database, params: { saleId: string; reason: string; actorId?: string | null }) {
  const reason = params.reason.trim();
  if (!reason) throw new Error("Say why this bill is being cancelled.");
  const [sale] = await db.select().from(medicineSale).where(eq(medicineSale.id, params.saleId)).limit(1);
  if (!sale || sale.voidedAt) throw new Error("That medicine bill is already cancelled.");
  const rows = await db.select().from(payment).where(eq(payment.medicineSaleId, sale.id));
  if (totalPaid(rows) > 0) throw new Error("Money was taken against this bill — cancel that payment first.");

  const lines = await db.select().from(medicineSaleLine).where(eq(medicineSaleLine.saleId, sale.id));
  const ids = lines.map((l) => l.medicineId).filter((id): id is string => Boolean(id));
  const items = ids.length ? await db.select().from(medicine).where(inArray(medicine.id, ids)) : [];
  const kitIds = items.filter((i) => i.isKit).map((i) => i.id);
  const parts = kitIds.length ? await db.select().from(medicineComponent).where(inArray(medicineComponent.kitId, kitIds)) : [];

  // Back onto the shelf it came off: the selling clinic, or the patient's for
  // an older bill that did not record one.
  let shelf = sale.clinicId;
  if (!shelf) {
    const [buyer] = await db.select({ clinicId: contact.clinicId }).from(contact).where(eq(contact.id, sale.contactId)).limit(1);
    shelf = buyer?.clinicId ?? null;
  }
  if (!shelf && lines.some((l) => l.medicineId)) {
    throw new Error("This bill is not on any clinic's books, so there is no shelf to return the medicine to.");
  }

  return db.transaction(async (tx) => {
    const t = tx as unknown as Database;
    await t.update(medicineSale).set({ voidedAt: new Date(), voidReason: reason }).where(eq(medicineSale.id, sale.id));
    for (const line of lines) {
      if (!line.medicineId) continue;
      const back = kitIds.includes(line.medicineId)
        ? parts.filter((p) => p.kitId === line.medicineId).map((p) => ({ medicineId: p.componentId, quantity: p.quantity * line.quantity }))
        : [{ medicineId: line.medicineId, quantity: line.quantity }];
      for (const r of back) {
        await recordMovement(t, {
          clinicId: shelf!,
          medicineId: r.medicineId,
          kind: MovementKind.RETURN,
          quantity: r.quantity,
          contactId: sale.contactId,
          note: `Bill cancelled: ${line.name}`,
          actorId: params.actorId,
        });
      }
    }
  });
}

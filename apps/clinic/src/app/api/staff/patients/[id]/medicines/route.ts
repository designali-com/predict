import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import {
  carePlanItem,
  contact,
  medicine,
  patientRecord,
  payment,
  planEnrollment,
  planEnrollmentItem,
  stockMovement,
} from "@workspace/db/schema";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "@workspace/db";
import { medicineBills } from "@workspace/db/medicine-sale";
import { PaymentKind } from "@workspace/db/payment";
import { CarePlanItemType } from "@workspace/db/care-plan";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { denyPartner, guardPatient } from "@/src/lib/auth/patient-scope";

/**
 * Every medicine one patient has, on one screen.
 *
 * GET {
 *   allotted   — per course: each medicine the package carries, how many were
 *                given on sittings (or handed over against it), and what is left
 *   purchases  — medicine bought at the counter, one row per bill
 *   dispensed  — what actually left the shelf for them, line by line
 *   prescribed — what they were told to take at home (care plan)
 * }
 *
 * Read from the same rows the bill, the stock ledger and the care plan are
 * kept in, so this screen cannot disagree with any of them.
 */

const PERMS = ["clinic.patients", "clinic.appointments", "clinic.billing"];

async function contactIdFor(id: string) {
  const chart = await db.query.patientRecord.findFirst({ where: eq(patientRecord.id, id) });
  return (
    chart?.contactId ??
    (await db.query.contact.findFirst({ columns: { id: true }, where: eq(contact.id, id) }))?.id ??
    null
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const blocked = (await denyPartner()) ?? (await guardPatient(id));
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(PERMS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor(id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  const courses = await db
    .select({
      id: planEnrollment.id,
      planName: planEnrollment.planName,
      status: planEnrollment.status,
      startDate: planEnrollment.startDate,
    })
    .from(planEnrollment)
    .where(eq(planEnrollment.contactId, contactId))
    .orderBy(desc(planEnrollment.createdAt));

  const courseIds = courses.map((c) => c.id);
  const lines = courseIds.length
    ? await db
        .select({
          enrollmentId: planEnrollmentItem.enrollmentId,
          medicineId: planEnrollmentItem.medicineId,
          name: planEnrollmentItem.name,
          quantity: planEnrollmentItem.quantity,
          isExtra: planEnrollmentItem.isExtra,
          unit: medicine.unit,
        })
        .from(planEnrollmentItem)
        .leftJoin(medicine, eq(medicine.id, planEnrollmentItem.medicineId))
        .where(and(inArray(planEnrollmentItem.enrollmentId, courseIds), eq(planEnrollmentItem.kind, "medicine")))
        .orderBy(asc(planEnrollmentItem.sortOrder))
    : [];

  // What has gone out against each course, per medicine. Out-movements are
  // stored negative, so the given amount is the negated sum.
  const given = courseIds.length
    ? await db
        .select({
          enrollmentId: stockMovement.enrollmentId,
          medicineId: stockMovement.medicineId,
          qty: sql<number>`-sum(${stockMovement.quantity})`.mapWith(Number),
        })
        .from(stockMovement)
        .where(and(inArray(stockMovement.enrollmentId, courseIds), lt(stockMovement.quantity, 0)))
        .groupBy(stockMovement.enrollmentId, stockMovement.medicineId)
    : [];
  const givenOf = (enrollmentId: string, medicineId: string | null) =>
    given.find((g) => g.enrollmentId === enrollmentId && g.medicineId === medicineId)?.qty ?? 0;

  const allotted = courses.map((c) => ({
    ...c,
    items: lines
      .filter((l) => l.enrollmentId === c.id)
      .map((l) => {
        const out = l.medicineId ? givenOf(c.id, l.medicineId) : 0;
        return {
          name: l.name,
          unit: l.unit ?? "piece",
          isExtra: l.isExtra,
          allotted: l.quantity,
          given: out,
          remaining: Math.max(0, l.quantity - out),
        };
      }),
  }));

  const purchases = await db
    .select({
      id: payment.id,
      collectedAt: payment.collectedAt,
      createdAt: payment.createdAt,
      receiptNo: payment.receiptNo,
      amountInPaise: payment.amountInPaise,
      method: payment.method,
      items: payment.note,
      voidedAt: payment.voidedAt,
    })
    .from(payment)
    // Sales from before medicine had bills of their own: the payment was the sale.
    .where(and(eq(payment.contactId, contactId), eq(payment.kind, PaymentKind.MEDICINE), isNull(payment.medicineSaleId)))
    .orderBy(desc(payment.collectedAt));

  // A bill now stands apart from its payments — taken now, or owed.
  const bills = await medicineBills(db, { contactId });

  const dispensed = await db
    .select({
      id: stockMovement.id,
      medicineName: medicine.name,
      unit: medicine.unit,
      kind: stockMovement.kind,
      quantity: stockMovement.quantity,
      note: stockMovement.note,
      enrollmentId: stockMovement.enrollmentId,
      occurredAt: stockMovement.occurredAt,
    })
    .from(stockMovement)
    .innerJoin(medicine, eq(medicine.id, stockMovement.medicineId))
    .where(and(eq(stockMovement.contactId, contactId), lt(stockMovement.quantity, 0)))
    .orderBy(desc(stockMovement.occurredAt))
    .limit(300);

  const prescribed = await db
    .select({
      id: carePlanItem.id,
      type: carePlanItem.type,
      name: carePlanItem.name,
      instructions: carePlanItem.instructions,
      slots: carePlanItem.slots,
      startDate: carePlanItem.startDate,
      endDate: carePlanItem.endDate,
      isActive: carePlanItem.isActive,
    })
    .from(carePlanItem)
    .where(
      and(
        eq(carePlanItem.contactId, contactId),
        inArray(carePlanItem.type, [CarePlanItemType.MEDICATION, CarePlanItemType.SUPPLEMENT]),
      ),
    )
    .orderBy(desc(carePlanItem.isActive), desc(carePlanItem.startDate));

  return NextResponse.json({
    allotted,
    purchases: [
      ...bills.map((b) => ({
        id: b.id,
        at: b.soldAt,
        receiptNo: null,
        items: b.note,
        totalInPaise: b.totalInPaise,
        discountInPaise: b.discountInPaise,
        paidInPaise: b.paidInPaise,
        outstandingInPaise: b.outstandingInPaise,
        method: null,
        voidedAt: null,
      })),
      ...purchases.map((p) => ({
        id: p.id,
        at: p.collectedAt ?? p.createdAt,
        receiptNo: p.receiptNo,
        items: p.items,
        totalInPaise: p.amountInPaise,
        discountInPaise: 0,
        paidInPaise: p.voidedAt ? 0 : p.amountInPaise,
        outstandingInPaise: 0,
        method: p.method,
        voidedAt: p.voidedAt,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    dispensed: dispensed.map((d) => ({ ...d, quantity: -d.quantity })),
    prescribed,
  });
}

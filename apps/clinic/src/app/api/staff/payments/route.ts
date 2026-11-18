import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { appointment, contact, medicine, planEnrollment, planEnrollmentItem, treatmentPlanItem } from "@workspace/db/schema";
import { and, desc, eq, isNotNull } from "@workspace/db";
import {
  consultationBalance,
  paymentsForContact,
  recordPayment,
} from "@workspace/db/payment-service";
import { planBalance, PaymentKind } from "@workspace/db/payment";
import { enrollmentBill } from "@workspace/db/treatment-plan";
import { sellMedicine } from "@workspace/db/medicine-sale";
import { appointmentInClinic } from "@workspace/db/appointment-scope";
import { isPartnerClinic } from "@workspace/db/clinic-service";
import { requireClinicApiPermission, type ClinicContext } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";

/**
 * Every id this route is handed is checked against the clinic the desk is
 * acting in — the ids come from the browser, and one clinic's desk must not
 * read, charge or re-price another clinic's patient, visit or course.
 *
 * A patient no clinic has claimed yet is open to our own clinics (never to a
 * partner hospital), the same rule as the patient pages.
 */
function onBooks(clinicId: string | null, context: ClinicContext): boolean {
  return clinicId === context.clinic.id || (clinicId === null && !isPartnerClinic(context.clinic));
}

async function contactHere(contactId: string, context: ClinicContext): Promise<boolean> {
  const [row] = await db.select({ clinicId: contact.clinicId }).from(contact).where(eq(contact.id, contactId)).limit(1);
  return Boolean(row) && onBooks(row!.clinicId, context);
}

/** The visit, when it is this clinic's — and, given a contact, that person's. */
async function visitHere(appointmentId: string, context: ClinicContext, contactId?: string) {
  const [visit] = await db
    .select({ id: appointment.id, contactId: appointment.contactId })
    .from(appointment)
    .where(and(eq(appointment.id, appointmentId), appointmentInClinic(context.clinic.id)))
    .limit(1);
  if (!visit || (contactId && visit.contactId !== contactId)) return null;
  return visit;
}

/** The course, when it is this clinic's and that person's. */
async function courseHere(enrollmentId: string, context: ClinicContext, contactId: string) {
  const [course] = await db.select().from(planEnrollment).where(eq(planEnrollment.id, enrollmentId)).limit(1);
  if (!course || course.contactId !== contactId) return null;
  // An older course carries no clinic; the patient's (checked by the caller) stands in.
  if (course.clinicId && course.clinicId !== context.clinic.id) return null;
  return course;
}

const NOT_HERE = (what: string) => NextResponse.json({ error: `No such ${what} at this clinic.` }, { status: 404 });

/**
 * Money taken at the front desk.
 *
 * One route for both kinds because they are the same act — somebody handed
 * money over and somebody recorded it — and a single ledger per patient is what
 * the desk actually reads. Which one it was is the kind.
 */
export async function GET(req: Request) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);

  // What can be sold at the counter, with the last catalogue rate as a starting
  // price. The storeroom list is a different permission; the desk only needs
  // the name and what it usually costs.
  if (url.searchParams.get("view") === "medicines") {
    const rows = await db
      .select({
        id: medicine.id,
        name: medicine.name,
        unit: medicine.unit,
        isKit: medicine.isKit,
        ownRate: medicine.rateInPaise,
      })
      .from(medicine)
      .where(eq(medicine.isActive, true))
      .orderBy(medicine.name);

    const rates = await db
      .select({
        medicineId: treatmentPlanItem.medicineId,
        rateInPaise: treatmentPlanItem.rateInPaise,
      })
      .from(treatmentPlanItem)
      .where(isNotNull(treatmentPlanItem.medicineId))
      .orderBy(desc(treatmentPlanItem.updatedAt));

    // A plan line saved at ₹0 must not hide the price the same medicine
    // already carries on another package. The newest positive rate wins.
    const rateById = new Map<string, number>();
    for (const rate of rates) {
      if (!rate.medicineId || rate.rateInPaise <= 0 || rateById.has(rate.medicineId)) continue;
      rateById.set(rate.medicineId, rate.rateInPaise);
    }

    return NextResponse.json({
      // The medicine's own counter price first; a plan's rate only for one
      // that has none set yet.
      medicines: rows.map(({ ownRate, ...row }) => ({
        ...row,
        rateInPaise: ownRate > 0 ? ownRate : (rateById.get(row.id) ?? null),
      })),
    });
  }

  const contactId = url.searchParams.get("contactId");
  const appointmentId = url.searchParams.get("appointmentId");
  const enrollmentId = url.searchParams.get("enrollmentId");

  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  if (!(await contactHere(contactId, context))) return NOT_HERE("patient");
  if (appointmentId && !(await visitHere(appointmentId, context, contactId))) return NOT_HERE("visit");

  // This clinic's ledger: money another clinic took from the same person is
  // that clinic's to show. An unstamped row is from before clinics, so ours.
  const payments = (await paymentsForContact(db, contactId)).filter(
    (p) => p.clinicId === context.clinic.id || p.clinicId === null,
  );

  // The consultation fee for one visit, when asked about one.
  const consultation = appointmentId ? await consultationBalance(db, appointmentId) : null;

  // A course's balance, and separately whether the advance is met — those are
  // two different questions and only the second decides if it can start.
  let plan = null;
  if (enrollmentId) {
    // Another clinic's course reads as none, like one that does not exist.
    const course = await courseHere(enrollmentId, context, contactId);

    if (course) {
      const items = await db
        .select()
        .from(planEnrollmentItem)
        .where(eq(planEnrollmentItem.enrollmentId, enrollmentId));

      const { grossInPaise, discountInPaise, packageInPaise, totalInPaise } = enrollmentBill(course, items);

      const paid = payments.filter(
        (p) => p.enrollmentId === enrollmentId && p.kind === PaymentKind.TREATMENT_PLAN,
      );

      plan = {
        enrollmentId,
        status: course.status,
        grossInPaise,
        discountInPaise,
        packageInPaise,
        totalInPaise,
        ...planBalance(packageInPaise, course.advancePercent, paid),
        // The full bill including extras is what is owed; the advance above is
        // measured against the package alone.
        outstandingInPaise: Math.max(
          0,
          totalInPaise - paid.filter((p) => !p.voidedAt).reduce((n, p) => n + p.amountInPaise, 0),
        ),
      };
    }
  }

  return NextResponse.json({ payments, consultation, plan });
}

export async function POST(req: Request) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { session } = context;

  const body = await req.json().catch(() => null);

  const contactId = String(body?.contactId ?? "");
  if (contactId && !(await contactHere(contactId, context))) return NOT_HERE("patient");
  const appointmentId = typeof body?.appointmentId === "string" && body.appointmentId ? body.appointmentId : null;
  if (appointmentId && !(await visitHere(appointmentId, context, contactId))) return NOT_HERE("visit");
  const enrollmentId = typeof body?.enrollmentId === "string" && body.enrollmentId ? body.enrollmentId : null;
  if (enrollmentId && !(await courseHere(enrollmentId, context, contactId))) return NOT_HERE("course");

  if (body?.kind === PaymentKind.MEDICINE) {
    const lines = Array.isArray(body.lines) ? body.lines : [];
    try {
      const { payment, sale } = await sellMedicine(db, {
        // Optional: a counter sale to somebody with no visit today.
        appointmentId,
        contactId,
        // Billed, and numbered, in this clinic's book.
        clinicId: context.clinic.id,
        // False puts the bill on the patient's dues — taken now, paid later.
        payNow: body.payNow !== false,
        method: body.method,
        reference: body.reference,
        actorId: session.user.id,
        lines: lines.map(
          (line: { medicineId?: string; quantity?: number; rateInRupees?: number; discountType?: string; discountValue?: number }) => ({
            medicineId: String(line?.medicineId ?? ""),
            quantity: Number(line?.quantity ?? 0),
            rateInPaise: Math.round(Number(line?.rateInRupees ?? 0) * 100),
            discountType: line?.discountType === "percent" || line?.discountType === "amount" ? line.discountType : null,
            discountValue: Number(line?.discountValue ?? 0) || null,
          }),
        ),
      });
      return NextResponse.json({ payment, sale }, { status: 201 });
    } catch (error) {
      return NextResponse.json(
        { error: describeError(error, "Could not record that sale") },
        { status: 400 },
      );
    }
  }

  try {
    const payment = await recordPayment(db, {
      contactId,
      kind: String(body?.kind ?? ""),
      appointmentId,
      enrollmentId,
      // The receipt is numbered in the book of the clinic that took the money.
      clinicId: context.clinic.id,
      // Rupees at the desk, paise in the column.
      amountInPaise: Math.round(Number(body?.amountInRupees ?? 0) * 100),
      method: body?.method,
      reference: body?.reference,
      note: body?.note,
      actorId: session.user.id,
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not record that payment") },
      { status: 400 },
    );
  }
}

/** Change what a visit is charged — a concession, or a fee the clinic revised. */
export async function PATCH(req: Request) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const appointmentId = typeof body?.appointmentId === "string" ? body.appointmentId : "";
  const rupees = Number(body?.feeInRupees);

  if (!appointmentId) {
    return NextResponse.json({ error: "appointmentId is required" }, { status: 400 });
  }
  if (!Number.isFinite(rupees) || rupees < 0) {
    return NextResponse.json({ error: "The fee cannot be negative." }, { status: 400 });
  }
  if (!(await visitHere(appointmentId, context))) return NOT_HERE("visit");

  await db
    .update(appointment)
    .set({ feeInPaise: Math.round(rupees * 100), updatedAt: new Date() })
    .where(eq(appointment.id, appointmentId));

  return NextResponse.json({ consultation: await consultationBalance(db, appointmentId) });
}

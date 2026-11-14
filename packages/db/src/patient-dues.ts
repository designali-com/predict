import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { appointment, contact, payment, planEnrollment, planEnrollmentItem } from "./schema";
import type * as schema from "./schema";
import { PaymentKind, planBalance, totalPaid } from "./payment";
import { consultationBalances } from "./payment-service";
import { enrollmentBill } from "./treatment-plan";
import { medicineBills, type MedicineBill } from "./medicine-sale";

type Database = NodePgDatabase<typeof schema>;

export interface PlanDue {
  enrollmentId: string;
  contactId: string;
  name: string | null;
  phone: string | null;
  planName: string;
  status: string;
  totalInPaise: number;
  paidInPaise: number;
  outstandingInPaise: number;
  advancePercent: number;
  advanceMet: boolean;
  advanceShortfallInPaise: number;
}

/**
 * Courses with money still owed — one clinic's (the Dues list) or one
 * patient's. A cancelled course owes nothing.
 */
export async function planDues(db: Database, where: { clinicId?: string; contactId?: string }): Promise<PlanDue[]> {
  const parts = [ne(planEnrollment.status, "cancelled")];
  if (where.clinicId) parts.push(eq(contact.clinicId, where.clinicId));
  if (where.contactId) parts.push(eq(planEnrollment.contactId, where.contactId));
  const courses = await db
    .select({ enrollment: planEnrollment, name: contact.name, phone: contact.phone })
    .from(planEnrollment)
    .innerJoin(contact, eq(contact.id, planEnrollment.contactId))
    .where(and(...parts))
    .orderBy(desc(planEnrollment.createdAt));

  const ids = courses.map((c) => c.enrollment.id);
  const [items, paid] = await Promise.all([
    ids.length ? db.select().from(planEnrollmentItem).where(inArray(planEnrollmentItem.enrollmentId, ids)) : Promise.resolve([]),
    ids.length
      ? db
          .select()
          .from(payment)
          .where(and(inArray(payment.enrollmentId, ids), eq(payment.kind, PaymentKind.TREATMENT_PLAN)))
      : Promise.resolve([]),
  ]);

  return courses
    .map(({ enrollment, name, phone }) => {
      const bill = items.filter((i) => i.enrollmentId === enrollment.id);
      const { packageInPaise, totalInPaise } = enrollmentBill(enrollment, bill);
      const mine = paid.filter((p) => p.enrollmentId === enrollment.id);
      const balance = planBalance(packageInPaise, enrollment.advancePercent, mine);
      return {
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        name,
        phone,
        planName: enrollment.planName,
        status: enrollment.status,
        totalInPaise,
        paidInPaise: totalPaid(mine),
        outstandingInPaise: Math.max(0, totalInPaise - totalPaid(mine)),
        advancePercent: balance.advancePercent,
        advanceMet: balance.advanceMet,
        advanceShortfallInPaise: balance.advanceShortfallInPaise,
      };
    })
    .filter((p) => p.outstandingInPaise > 0);
}

export interface PatientDues {
  plans: PlanDue[];
  medicines: MedicineBill[];
  fees: { appointmentId: string; scheduledAt: string; dueInPaise: number; paidInPaise: number; outstandingInPaise: number }[];
  planInPaise: number;
  medicineInPaise: number;
  feeInPaise: number;
  totalInPaise: number;
}

/**
 * Everything one patient owes, in one place: what is left on their courses,
 * medicine taken and not yet paid for, and visit fees still open. The desk
 * reads the total; each part says where to collect it.
 */
export async function patientDues(db: Database, contactId: string): Promise<PatientDues> {
  const since = new Date(Date.now() - 365 * 86_400_000);
  const [plans, medicines, visits] = await Promise.all([
    planDues(db, { contactId }),
    medicineBills(db, { contactId, owingOnly: true }),
    db
      .select({ id: appointment.id, scheduledAt: appointment.scheduledAt })
      .from(appointment)
      .where(and(eq(appointment.contactId, contactId), ne(appointment.status, "cancelled"), gte(appointment.scheduledAt, since))),
  ]);
  const balances = await consultationBalances(db, visits.map((v) => v.id));
  const fees = visits
    .map((v) => ({ v, b: balances.get(v.id) }))
    .filter((x) => x.b && !x.b.settled && x.b.outstandingInPaise > 0)
    .map(({ v, b }) => ({
      appointmentId: v.id,
      scheduledAt: v.scheduledAt.toISOString(),
      dueInPaise: b!.dueInPaise,
      paidInPaise: b!.paidInPaise,
      outstandingInPaise: b!.outstandingInPaise,
    }));

  const planInPaise = plans.reduce((s, p) => s + p.outstandingInPaise, 0);
  const medicineInPaise = medicines.reduce((s, m) => s + m.outstandingInPaise, 0);
  const feeInPaise = fees.reduce((s, f) => s + f.outstandingInPaise, 0);
  return { plans, medicines, fees, planInPaise, medicineInPaise, feeInPaise, totalInPaise: planInPaise + medicineInPaise + feeInPaise };
}

import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { appointment, contact } from "@workspace/db/schema";
import { and, eq, gte, inArray, lt, ne } from "@workspace/db";
import { consultationBalances } from "@workspace/db/payment-service";
import { clinicDate, clinicInstant } from "@workspace/db/availability-service";
import { billingReport } from "@workspace/db/billing-report";
import { bloodTestDues } from "@workspace/db/payment-ledger";
import { planDues } from "@workspace/db/patient-dues";
import { medicineBills } from "@workspace/db/medicine-sale";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { appointmentInClinic } from "@workspace/db/appointment-scope";

/**
 * What is owed, right now — the front desk's worklist.
 *
 * Two queues, because they are chased differently. A consultation fee is due
 * today and blocks the doctor; a plan balance is a course already running that
 * has not been paid off, and only the advance ever blocked anything.
 */
export async function GET(req: Request) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Money is counted per clinic: today's desk takings are this clinic's.
  const clinicId = context.clinic.id;

  const url = new URL(req.url);

  // Collections over a period, asked for on its own: the worklist below is one
  // day and the report is a month, and loading a month of payments to render
  // today's queue would be paying for the wrong question.
  if (url.searchParams.get("view") === "report") {
    return NextResponse.json({
      report: await billingReport(db, {
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
        clinicId,
      }),
    });
  }

  const date = url.searchParams.get("date") ?? clinicDate(0);
  const dayStart = clinicInstant(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  // Fees still owed, for visits up to the day being looked at — the last 90
  // days, so an unpaid visit from last week is still in front of the desk
  // rather than only in the monthly report.
  const visits = await db
    .select({
      id: appointment.id,
      contactId: appointment.contactId,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
      name: contact.name,
      phone: contact.phone,
    })
    .from(appointment)
    .innerJoin(contact, eq(contact.id, appointment.contactId))
    .where(
      and(
        // By where the visit happened, not where the patient was first
        // registered: a fee for a consultation here is owed to this desk.
        appointmentInClinic(clinicId),
        gte(appointment.scheduledAt, new Date(dayStart.getTime() - 89 * 86_400_000)),
        lt(appointment.scheduledAt, dayEnd),
        ne(appointment.status, "cancelled"),
      ),
    )
    .orderBy(appointment.scheduledAt);

  const balances = await consultationBalances(db, visits.map((v) => v.id));

  const fees = visits
    .map((v) => ({ ...v, balance: balances.get(v.id) }))
    .filter((v) => v.balance && !v.balance.settled);

  // Courses with money outstanding — prescribed and unpaid, or running and part
  // paid. Cancelled ones are not chased.
  // Courses with money left on them, and medicine taken and not yet paid for.
  const [plans, bills] = await Promise.all([
    planDues(db, { clinicId }),
    medicineBills(db, { clinicId, owingOnly: true }),
  ]);
  const buyers = bills.length
    ? await db
        .select({ id: contact.id, name: contact.name, phone: contact.phone })
        .from(contact)
        .where(inArray(contact.id, [...new Set(bills.map((b) => b.contactId))]))
    : [];
  const buyer = new Map(buyers.map((b) => [b.id, b]));
  const medicines = bills.map((b) => ({ ...b, name: buyer.get(b.contactId)?.name ?? null, phone: buyer.get(b.contactId)?.phone ?? null }));

  const tests = await bloodTestDues(db, clinicId);

  return NextResponse.json({ date, fees, plans, tests, medicines });
}

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@workspace/db/client";
import { clinicContext } from "@/src/lib/auth/clinic";
import {
  appointment,
  contact,
  payment,
  planEnrollment,
  planEnrollmentItem,
} from "@workspace/db/schema";
import { and, asc, eq, gte, inArray, lt, ne } from "@workspace/db";
import { enrollmentBill } from "@workspace/db/treatment-plan";
import { PaymentKind, totalPaid } from "@workspace/db/payment";
import { auth } from "@/src/lib/auth/auth";
import { grantedPermissions, isUnrestricted } from "@workspace/db/permission-service";
import { visitStates } from "@workspace/db/visit-service";
import { visitStageMeta } from "@workspace/db/visit-workflow";
import { clinicDate, clinicInstant } from "@workspace/db/availability-service";
import { waitingMinutes } from "@workspace/db/arrival";
import { appointmentInClinic } from "@workspace/db/appointment-scope";
import { denyPartner } from "@/src/lib/auth/patient-scope";

interface PlanOwing {
  enrollmentId: string;
  contactId: string;
  name: string | null;
  phone: string | null;
  planName: string;
  status: string;
  totalInPaise: number;
  paidInPaise: number;
  outstandingInPaise: number;
  /** Nothing has been collected at all — the one to chase first. */
  untouched: boolean;
}

async function plansOwing(clinicId: string): Promise<PlanOwing[]> {
  const courses = await db
    .select({ enrollment: planEnrollment, name: contact.name, phone: contact.phone })
    .from(planEnrollment)
    .innerJoin(contact, eq(contact.id, planEnrollment.contactId))
    // Only running courses: a prescribed one is not started, a finished one is
    // chased from billing, not from today's queue.
    .where(and(eq(contact.clinicId, clinicId), eq(planEnrollment.status, "active")));

  const ids = courses.map((c) => c.enrollment.id);
  if (!ids.length) return [];

  const [items, paid] = await Promise.all([
    db.select().from(planEnrollmentItem).where(inArray(planEnrollmentItem.enrollmentId, ids)),
    db
      .select()
      .from(payment)
      .where(
        and(inArray(payment.enrollmentId, ids), eq(payment.kind, PaymentKind.TREATMENT_PLAN)),
      ),
  ]);

  return courses
    .map(({ enrollment, name, phone }) => {
      const bill = items.filter((i) => i.enrollmentId === enrollment.id);
      const { totalInPaise } = enrollmentBill(enrollment, bill);
      const mine = paid.filter((p) => p.enrollmentId === enrollment.id);
      const paidInPaise = totalPaid(mine);

      return {
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        name,
        phone,
        planName: enrollment.planName,
        status: enrollment.status,
        totalInPaise,
        paidInPaise,
        outstandingInPaise: Math.max(0, totalInPaise - paidInPaise),
        untouched: paidInPaise === 0,
      };
    })
    .filter((p) => p.outstandingInPaise > 0)
    .sort((a, b) => b.outstandingInPaise - a.outstandingInPaise);
}

/**
 * Today's visits, and whose move each one is.
 *
 * The stage is already derived from forms, payments and prescriptions, and
 * every stage already knows whose move it is. Nothing new is computed here —
 * this is that answer, filtered to the person asking, so a doctor sees the
 * patient the moment the front desk takes their fee and the desk sees the plan
 * the moment the doctor prescribes it.
 *
 * Polled rather than pushed. A clinic day moves in minutes, not milliseconds;
 * a socket per open tab across three apps would be a great deal of machinery
 * to shave twenty seconds off a receptionist noticing a patient who is already
 * standing in front of her.
 */
export async function GET(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await clinicContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;

  // Permissions come from the role held in THIS clinic.
  const held = new Set(await grantedPermissions(db, context.principal));
  if (!held.has("clinic.appointments") && !held.has("clinic.patients")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role ?? "";
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? clinicDate(0);

  const dayStart = clinicInstant(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const rows = await db
    .select({
      id: appointment.id,
      contactId: appointment.contactId,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
      arrivedAt: appointment.arrivedAt,
      doctorUserId: appointment.doctorUserId,
      name: contact.name,
      phone: contact.phone,
    })
    .from(appointment)
    .innerJoin(contact, eq(contact.id, appointment.contactId))
    .where(
      and(
        // This clinic's day only; another clinic's queue is not ours to work.
        appointmentInClinic(context.clinic.id),
        gte(appointment.scheduledAt, dayStart),
        lt(appointment.scheduledAt, dayEnd),
        ne(appointment.status, "cancelled"),
      ),
    )
    .orderBy(asc(appointment.scheduledAt));

  const states = await visitStates(db, rows.map((r) => ({ id: r.id, contactId: r.contactId })));

  const visits = rows.map((row) => {
    const state = states.get(row.id);
    const meta = state ? visitStageMeta(state.stage) : undefined;

    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      scheduledAt: row.scheduledAt,
      status: row.status,
      arrivedAt: row.arrivedAt,
      waitingMinutes: row.status === "completed" ? null : waitingMinutes(row.arrivedAt),
      doctorUserId: row.doctorUserId,
      stage: state?.stage ?? null,
      stageLabel: meta?.label ?? null,
      owner: meta?.owner ?? "none",
      waitingOn: meta?.waitingOn ?? null,
      // The fee gate, which is why a doctor's list can be shorter than the
      // day's bookings.
      feePaid: state?.facts.feePaid ?? false,
    };
  });

  /**
   * Whose move counts as "mine".
   *
   * By role, not by permission: a doctor and a nutritionist hold exactly the
   * same grants and are waiting for completely different things. An
   * unrestricted account sees every stage, because its job is the whole day.
   */
  const mine = isUnrestricted(role)
    ? ["receptionist", "doctor", "nutritionist"]
    : ["receptionist", "doctor", "nutritionist"].includes(role)
      ? [role]
      : [];

  /**
   * Courses with money still on them.
   *
   * Reported separately from the stages above, and not gated on the stage,
   * because the two answer different questions. The stage says whose move
   * the VISIT is; this says what is unpaid — and a plan on a 0% advance is
   * never anybody's move, because nothing is required before treatment
   * starts. The whole price is still owed, and the desk was the last to
   * know: it appeared only on the billing page.
   *
   * Not date-filtered either. A course is owed until it is paid off, and
   * showing only today's would hide every one that has been outstanding a
   * fortnight.
   */
  const collectable = held.has("clinic.billing") ? await plansOwing(context.clinic.id) : [];

  return NextResponse.json({
    date,
    role,
    mine,
    visits,
    collectable,
    // A doctor's own list, when they hold one. Everyone else's "mine" is the
    // stage owner alone.
    userId: session.user.id,
  });
}

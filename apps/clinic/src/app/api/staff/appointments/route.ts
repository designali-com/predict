import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { isFeeWaived } from "@workspace/db/payment";
import { consultationBalances } from "@workspace/db/payment-service";
import { appointment, contact, user } from "@workspace/db/schema";
import { and, desc, eq, gte, inArray, isNull, lte } from "@workspace/db";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { appointmentInClinic } from "@workspace/db/appointment-scope";
import { can } from "@workspace/db/permission-service";
import { membershipsFor } from "@workspace/db/clinic-service";
import { captureLead, getOrCreateContactForUser } from "@/src/lib/contact";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { ensurePatientRecord } from "@workspace/db/patient-registry";
import { visitStates } from "@workspace/db/visit-service";
import { planSitting } from "@workspace/db/schema";
import { linkSittingToAppointment } from "@workspace/db/enrollment-service";
import { planEnrollment } from "@workspace/db/schema";
import { visitKind } from "@workspace/db/visit-kind";
import { notifyBookedVisit } from "@workspace/communication/visit-meet";
import {
  advisoryLock,
  slotLockKey,
  slotsForDay,
} from "@workspace/db/availability-service";

const APPOINTMENT_TYPES = ["consultation", "review"] as const;

// The staff picks a real slot (startIso) from GET /api/staff/appointments/slots
// and a channel, same as the patient-facing booking flow.
const commonFields = {
  // Required now. Slots belong to a doctor — "any doctor's availability" was
  // only ever answerable because the old Cal.com source had no doctors in it.
  doctorUserId: z.string().min(1),
  type: z.enum(APPOINTMENT_TYPES).optional(),
  // Not needed for a walk-in, which is booked for now.
  startIso: z.string().min(1).optional(),
  channel: z.enum(["virtual", "in_clinic"]),
  // Somebody standing at the desk: booked for this moment, in the clinic, and
  // already arrived — no slot to pick, because they are not waiting for one.
  walkIn: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  // Staff tick this on the booking form. The consultation fee becomes ₹0
  // instead of the column default.
  complimentary: z.boolean().optional(),
  // Booking one day of a course. The visit becomes a therapy day by being
  // linked to this sitting — there is no "therapy" type to pick.
  sittingId: z.string().optional().nullable(),
  // A mid-course review. Puts the visit on the course timeline WITHOUT
  // consuming a sitting the patient paid for.
  enrollmentId: z.string().optional().nullable(),
};

// A booked appointment doesn't require an onboarded (registered) patient —
// leads who booked but haven't signed up yet are just as real a visit. Both
// shapes ultimately resolve to a contactId; only the resolution differs:
// an existing user's contact is looked up/created, a lead's is captured
// fresh (deduped by phone/email, same as the public lead-capture funnel).
// Email is optional. The confirmation is sent from this app's mailbox, so a walk-in
// with a phone and no address is still a real booking.
const createSchema = z.union([
  z.object({
    patientId: z.string().min(1),
    ...commonFields,
  }),
  // Somebody already on record — a patient partway through a course, booked
  // from their own log sheet. Their contact is the identity; there is nothing
  // to capture and no email to invent.
  z.object({
    contactId: z.string().min(1),
    ...commonFields,
  }),
  z.object({
    leadName: z.string().min(1).optional(),
    leadPhone: z.string().min(1).optional(),
    leadEmail: z.string().email().optional(),
    ...commonFields,
  }),
]);

// Lists appointments, newest first. With ?patientId= scopes to one patient
// (existing per-patient view). Without it, returns every appointment across
// all patients/leads — the clinic-wide list used by the top-level
// Appointments page. Optional ?from=/&to= (ISO dates) narrow by scheduledAt
// either way.
export async function GET(request: NextRequest) {
  const context = await requireClinicApiPermission("clinic.appointments");
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const patientId = request.nextUrl.searchParams.get("patientId");
  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : null;
  const to = toParam ? new Date(toParam) : null;

  // Stamped rows, plus older bookings that were saved before clinic id existed.
  const conditions = [appointmentInClinic(context.clinic.id)];
  if (from && !Number.isNaN(from.getTime())) {
    conditions.push(gte(appointment.scheduledAt, from));
  }
  if (to && !Number.isNaN(to.getTime())) {
    conditions.push(lte(appointment.scheduledAt, to));
  }

  if (patientId) {
    const patientContact = await db.query.contact.findFirst({
      where: eq(contact.userId, patientId),
    });

    if (!patientContact) {
      return NextResponse.json({ appointments: [] });
    }

    conditions.push(eq(appointment.contactId, patientContact.id));
  }

  const rows = await db.query.appointment.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(appointment.scheduledAt)],
  });

  // Where each visit has got to, and whether the consultation fee has cleared.
  // Computed for the whole page at once — a query per row would turn one screen
  // into fifty round trips, and the fee is what decides whether the clinical
  // side may work this visit at all.
  const states = await visitStates(db, rows.map((r) => ({ id: r.id, contactId: r.contactId })));

  // What each visit IS. A therapy day is one a sitting points at — never a
  // type somebody picked — so it has to be looked up, and for a page of rows
  // that is one query rather than one per row.
  const ids = rows.map((r) => r.id);
  const sittings = ids.length
    ? await db
        .select({
          appointmentId: planSitting.appointmentId,
          dayNumber: planSitting.dayNumber,
          enrollmentId: planSitting.enrollmentId,
        })
        .from(planSitting)
        .where(inArray(planSitting.appointmentId, ids))
    : [];

  const courseIds = [
    ...new Set(
      [...rows.map((r) => r.enrollmentId), ...sittings.map((s) => s.enrollmentId)].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];
  const courses = courseIds.length
    ? await db
        .select({
          id: planEnrollment.id,
          planName: planEnrollment.planName,
          sittings: planEnrollment.sittings,
        })
        .from(planEnrollment)
        .where(inArray(planEnrollment.id, courseIds))
    : [];
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const doctorIds = [...new Set(rows.map((r) => r.doctorUserId).filter((id): id is string => Boolean(id)))];
  const doctors = doctorIds.length
    ? await db.query.user.findMany({ where: inArray(user.id, doctorIds) })
    : [];
  const doctorNameById = new Map(doctors.map((d) => [d.id, d.name]));

  // Only the unscoped (clinic-wide) list needs "whose appointment is this"
  // resolved — the per-patient view already knows who it's for.
  let contactById = new Map<string, { name: string | null; userId: string | null; phone: string | null; email: string | null }>();
  let patientNameByUserId = new Map<string, string>();
  if (!patientId) {
    const contactIds = [...new Set(rows.map((r) => r.contactId))];
    const contacts = contactIds.length
      ? await db.query.contact.findMany({ where: inArray(contact.id, contactIds) })
      : [];
    contactById = new Map(
      contacts.map((c) => [c.id, { name: c.name, userId: c.userId, phone: c.phone, email: c.email }]),
    );

    const patientUserIds = [
      ...new Set(contacts.map((c) => c.userId).filter((v): v is string => Boolean(v))),
    ];
    const patients = patientUserIds.length
      ? await db.query.user.findMany({ where: inArray(user.id, patientUserIds) })
      : [];
    patientNameByUserId = new Map(patients.map((p) => [p.id, p.name]));
  }

  // THE FEE GATE.
  //
  // A visit with the consultation fee outstanding does not reach the clinical
  // side. Whoever can take money still sees it — that is the whole point, they
  // are the ones who make it payable — so the signal is the billing permission
  // rather than a role name, and a clinician who types the URL gets the same
  // answer as one who reads the list.
  //
  // Until there was a screen that could collect a fee this had to stay off:
  // nothing was ever payable, so switching it on would have hidden every visit
  // from every doctor for ever.
  //
  // The desk sees everything too: whoever books and manages appointments
  // (ops.appointments — a manager, the front desk) has to see the visit that
  // has not been paid for yet, or it vanishes from the one list they work
  // from. The gate is for the clinical side, which never holds that key.
  const handlesMoney =
    (await can(db, context.principal, "clinic.billing")) || (await can(db, context.principal, "ops.appointments"));
  // A visit still owing its fee stays off every other clinician's list. The
  // person it was booked onto still has to see it: a nutritionist consultation
  // picked on WhatsApp would otherwise never appear on their panel, because
  // the desk has not taken the fee yet and they cannot take it themselves.
  const visible = handlesMoney
    ? rows
    : rows.filter(
        (r) => states.get(r.id)?.visibleToClinicians || r.doctorUserId === context.principal.id,
      );

  const feeBalances = await consultationBalances(db, visible.map((r) => r.id));

  const appointments = visible.map((r) => {
    const c = contactById.get(r.contactId);
    const patientName = c
      ? ((c.userId ? patientNameByUserId.get(c.userId) : null) ?? c.name ?? "Unknown")
      : null;

    const state = states.get(r.id);

    const sitting = sittings.find((s) => s.appointmentId === r.id) ?? null;
    const course = courseById.get(sitting?.enrollmentId ?? r.enrollmentId ?? "") ?? null;
    const kind = visitKind({ type: r.type, sitting, enrollment: course });

    return {
      ...r,
      doctorName: r.doctorUserId ? (doctorNameById.get(r.doctorUserId) ?? null) : null,
      patientName,
      patientPhone: c?.phone ?? null,
      patientEmail: c?.email ?? null,
      // Therapy / consultation / review, derived — see @workspace/db/visit-kind.
      kind: kind.kind,
      kindDetail: kind.detail,
      // Where this visit is in the workflow, and what is blocking it. Derived
      // from forms, payments and prescriptions rather than stored — see
      // @workspace/db/visit-workflow.
      stage: state?.stage ?? null,
      feePaid: state?.facts.feePaid ?? false,
      // Cancelled or a no-show: the fee is not charged — never "due".
      feeWaived: isFeeWaived(r.status),
      feeCollectedInPaise: feeBalances.get(r.id)?.paidInPaise ?? 0,
      visibleToClinicians: state?.visibleToClinicians ?? false,
      pendingFormKeys: state?.pendingFormKeys ?? [],
      enrollmentId: state?.enrollmentId ?? null,
    };
  });

  return NextResponse.json({ appointments });
}

/**
 * Whether a contact may be booked here: on this clinic's books, or on nobody's
 * yet (an ad lead, an old row) — the booking below claims those.
 */
function onBooksOf(row: { clinicId: string | null }, clinicId: string): boolean {
  return row.clinicId === null || row.clinicId === clinicId;
}

const NOT_HERE = "That patient is at another clinic.";

/** The clinic-local calendar day an instant falls on. */
function clinicDateOf(at: Date): string {
  return new Date(at.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const context = await requireClinicApiPermission("clinic.appointments");
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const walkIn = data.walkIn === true;
  if (!walkIn && !data.startIso) {
    return NextResponse.json({ error: "Pick a date and time." }, { status: 400 });
  }
  // A walk-in is now, to the minute. A walk-in is never a video call.
  const startDate = walkIn ? new Date(Math.floor(Date.now() / 60_000) * 60_000) : new Date(data.startIso!);
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "startIso must be a valid date" }, { status: 400 });
  }
  if (walkIn) data.channel = "in_clinic";

  // Every id in the body is checked against the clinic this desk is acting
  // in. The ids come from the browser; without this, one clinic could book
  // its visit onto another clinic's doctor, patient or course.
  const [doctorRow] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, data.doctorUserId))
    .limit(1);
  const doctorClinics = doctorRow ? await membershipsFor(db, doctorRow) : [];
  if (!doctorClinics.some((m) => m.clinic.id === context.clinic.id)) {
    return NextResponse.json({ error: "That doctor does not work at this clinic." }, { status: 400 });
  }

  // Resolve attendee info before the insert — for an existing patient this
  // comes from their user record, for a lead it's what was typed in the form.
  let attendee: { name: string; email: string };
  if ("patientId" in data) {
    const patientUser = await db.query.user.findFirst({ where: eq(user.id, data.patientId) });
    if (!patientUser) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    const [linked] = await db
      .select({ clinicId: contact.clinicId })
      .from(contact)
      .where(eq(contact.userId, data.patientId))
      .limit(1);
    if (linked && !onBooksOf(linked, context.clinic.id)) {
      return NextResponse.json({ error: NOT_HERE }, { status: 404 });
    }
    attendee = { name: patientUser.name ?? "Patient", email: patientUser.email };
  } else if ("contactId" in data) {
    const [row] = await db
      .select({ name: contact.name, email: contact.email, clinicId: contact.clinicId })
      .from(contact)
      .where(eq(contact.id, data.contactId))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "That patient is not on record." }, { status: 404 });
    }
    if (!onBooksOf(row, context.clinic.id)) {
      return NextResponse.json({ error: NOT_HERE }, { status: 404 });
    }
    // No email is not an error. The visit is booked either way; a confirmation
    // is sent only when there is an address to send it to.
    attendee = { name: row.name ?? "Patient", email: row.email ?? "" };
  } else {
    attendee = { name: data.leadName?.trim() || "Guest", email: data.leadEmail ?? "" };
  }

  // The slot is ours to grant, so it is re-checked here against the doctor's
  // pattern, their leave and what is already booked. The list the desk saw a
  // moment ago is informational; this is the authority, and it runs behind an
  // advisory lock so two people taking the same time a millisecond apart cannot
  // both get it.
  const slotDate = clinicDateOf(startDate);

  // A therapy day takes its course from its sitting; a review is booked against
  // the course directly. Resolved before the insert so the row carries it from
  // the start rather than being patched afterwards.
  let sittingRow: typeof planSitting.$inferSelect | undefined;
  if (data.sittingId) {
    [sittingRow] = await db
      .select()
      .from(planSitting)
      .where(eq(planSitting.id, data.sittingId))
      .limit(1);
    if (!sittingRow) {
      return NextResponse.json({ error: "That sitting no longer exists." }, { status: 400 });
    }
    if (sittingRow.appointmentId) {
      return NextResponse.json(
        { error: "That sitting is already booked." },
        { status: 409 },
      );
    }
  }
  const enrollmentId = sittingRow?.enrollmentId ?? data.enrollmentId ?? null;
  if (enrollmentId) {
    // The course, and the person it is for, have to be this clinic's too.
    const [course] = await db
      .select({ clinicId: planEnrollment.clinicId, contactClinicId: contact.clinicId })
      .from(planEnrollment)
      .leftJoin(contact, eq(contact.id, planEnrollment.contactId))
      .where(eq(planEnrollment.id, enrollmentId))
      .limit(1);
    if (!course) {
      return NextResponse.json({ error: "That course no longer exists." }, { status: 400 });
    }
    const courseClinic = course.clinicId ?? course.contactClinicId;
    if (courseClinic && courseClinic !== context.clinic.id) {
      return NextResponse.json({ error: "That course belongs to another clinic." }, { status: 404 });
    }
  }

  let created: typeof appointment.$inferSelect | undefined;
  let bookingContact: Awaited<ReturnType<typeof getOrCreateContactForUser>>;

  try {
    bookingContact = "patientId" in data
      ? await getOrCreateContactForUser(data.patientId)
      : "contactId" in data
      ? (await db.select().from(contact).where(eq(contact.id, data.contactId)).limit(1))[0]!
      : await captureLead({
          name: data.leadName,
          phone: data.leadPhone,
          email: data.leadEmail,
          source: "IN_CLINIC",
          clinicId: context.clinic.id,
        });

    // A typed-in phone or email can match somebody another clinic holds.
    // That person is not this desk's to book.
    if (!onBooksOf(bookingContact, context.clinic.id)) {
      return NextResponse.json({ error: NOT_HERE }, { status: 409 });
    }

    const outcome = await db.transaction(async (tx) => {
      // The patient is already here, so the doctor's slot pattern has no say —
      // they join the queue for whoever they are seeing.
      if (!walkIn) {
        await tx.execute(advisoryLock(slotLockKey(data.doctorUserId, slotDate, startDate.toISOString())));

        const { slots, closedReason } = await slotsForDay(tx, {
          doctorUserId: data.doctorUserId,
          date: slotDate,
          clinicId: context.clinic.id,
        });
        if (closedReason) return { error: closedReason };

        const slot = slots.find((s) => s.startIso === startDate.toISOString());
        if (!slot) return { error: "That time is not one of this doctor's slots any more." };
        if (slot.remaining <= 0) return { error: "That time has just been taken." };
      }

      const [row] = await tx
        .insert(appointment)
        .values({
          contactId: bookingContact.id,
          clinicId: context.clinic.id,
          doctorUserId: data.doctorUserId,
          type: data.type ?? "consultation",
          scheduledAt: startDate,
          status: "scheduled",
          // In front of the desk already — straight into the waiting queue.
          ...(walkIn ? { arrivedAt: startDate } : {}),
          notes: data.notes || null,
          channel: data.channel,
          enrollmentId,
          // A therapy day is paid for by the course. Left to the column default
          // it picked up the ₹1,500 consultation fee, so a sitting the patient
          // had already bought was gated behind paying for it a second time —
          // and the doctor could not see them until somebody did.
          ...(sittingRow || data.complimentary ? { feeInPaise: 0 } : {}),
          meetingLocation:
            data.channel === "in_clinic"
              ? [context.clinic.addressLine1, context.clinic.addressLine2, context.clinic.city]
                  .filter((part): part is string => Boolean(part && part.trim()))
                  .join(", ") || null
              : null,
        })
        .returning();

      return { row };
    });

    if (outcome.error) {
      return NextResponse.json({ error: outcome.error }, { status: 409 });
    }
    created = outcome.row;

    if (!created) {
      throw new Error("Insert returned no row");
    }

    // What makes this a therapy day rather than a consultation. Nothing wrote
    // to plan_sitting.appointment_id before, which is also why marking a visit
    // attended could never tick its therapy day off the log sheet.
    if (sittingRow) {
      await linkSittingToAppointment(db, sittingRow.id, created.id);
    }

    // After the row exists: a Meet link for a virtual visit, then the
    // confirmation from EMAIL_FROM. A failure here is logged, not returned —
    // the visit is already in the book, and a failed email must not make the
    // desk book it a second time.
    // No confirmation for somebody standing at the desk.
    const location = walkIn ? created.meetingLocation : await notifyBookedVisit({
      appointmentId: created.id,
      clinicId: created.clinicId,
      channel: data.channel,
      start: startDate,
      meetingLocation: created.meetingLocation,
      attendeeName: attendee.name,
      attendeeEmail: attendee.email || null,
      doctorUserId: created.doctorUserId,
    });
    created = { ...created, meetingLocation: location };

    await emitDomainEvent(
      db,
      DomainEventType.APPOINTMENT_CREATED,
      {
        appointmentId: created.id,
        patientId: "patientId" in data ? data.patientId : null,
        doctorUserId: created.doctorUserId,
        scheduledAt: created.scheduledAt,
        channel: created.channel,
        calBookingUid: created.calBookingUid,
      },
      { contactId: bookingContact.id, idempotencyKey: `appointment_created:${created.id}` },
    );

    // A booked person is somebody notes, reports and therapy days will be
    // filed against, and all of that hangs off a chart. Outside the booking
    // transaction on purpose: if it fails the booking is still valid, and the
    // next call creates the chart.
    await ensurePatientRecord(db, bookingContact.id);

    // Booked here, so they belong here. A lead that came in from an ad has no
    // clinic yet, and without one their fees and payments never show on this
    // clinic's billing.
    await db
      .update(contact)
      .set({ clinicId: context.clinic.id, updatedAt: new Date() })
      .where(and(eq(contact.id, bookingContact.id), isNull(contact.clinicId)));

    return NextResponse.json({ appointment: created, contactId: bookingContact.id }, { status: 201 });
  } catch (error) {
    console.error("[appointments] could not save the booking:", error);
    return NextResponse.json({ error: "Could not save the booking. Nothing was charged — try again." }, { status: 500 });
  }
}

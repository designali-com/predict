import { withReadableUrls } from "@workspace/storage";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { appointment, appointmentNote, clinicalFormSubmission, contact, report, user } from "@workspace/db/schema";
import { and, asc, desc, eq, inArray } from "@workspace/db";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { appointmentInClinic } from "@workspace/db/appointment-scope";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { applyAppointmentOutcome } from "@workspace/db/appointment-outcome";
import { visitState } from "@workspace/db/visit-service";
import { visitKind } from "@workspace/db/visit-kind";
import { planEnrollment, planSitting } from "@workspace/db/schema";
import { clearArrival, markArrived } from "@workspace/db/arrival";
import { formsForVisit } from "@workspace/db/form-service";
import { convertContactToPatient } from "@workspace/db/convert-patient";
import { describeError } from "@/src/lib/api-error";

const APPOINTMENT_STATUSES = ["scheduled", "confirmed", "in_consultation", "completed", "cancelled", "no_show"] as const;

const patchSchema = z
  .object({
    status: z.enum(APPOINTMENT_STATUSES).optional(),
    scheduledAt: z.string().min(1).optional(),
    // Whether the patient is in the building. Its own field, not a status:
    // see @workspace/db/arrival.
    arrived: z.boolean().optional(),
    // Desk decision: this person is a patient even without a course.
    convertToPatient: z.literal(true).optional(),
  })
  .refine(
    (data) =>
      data.status !== undefined ||
      data.scheduledAt !== undefined ||
      data.arrived !== undefined ||
      data.convertToPatient === true,
    { message: "status, scheduledAt or arrived is required" },
  );

// The clinic context, not just the session: a visit is opened by id, and the
// id alone must not reach another clinic's book.
async function requireAppointmentManager() {
  return requireClinicApiPermission("clinic.appointments");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireAppointmentManager();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const appointmentRow = await db.query.appointment.findFirst({
    where: and(eq(appointment.id, id), appointmentInClinic(context.clinic.id)),
  });

  if (!appointmentRow) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const contactRow = await db.query.contact.findFirst({
    where: eq(contact.id, appointmentRow.contactId),
  });

  const [patientRow, doctorRow, reports, noteRows] = await Promise.all([
    contactRow?.userId
      ? db.query.user.findFirst({ where: eq(user.id, contactRow.userId) })
      : Promise.resolve(null),
    appointmentRow.doctorUserId
      ? db.query.user.findFirst({ where: eq(user.id, appointmentRow.doctorUserId) })
      : Promise.resolve(null),
    db.query.report.findMany({
      where: eq(report.appointmentId, id),
      orderBy: [desc(report.uploadedAt)],
    }),
    db.query.appointmentNote.findMany({
      where: eq(appointmentNote.appointmentId, id),
      orderBy: [asc(appointmentNote.createdAt)],
    }),
  ]);

  const authorIds = [...new Set(noteRows.map((n) => n.authorUserId))];
  const authors = authorIds.length
    ? await db.query.user.findMany({ where: inArray(user.id, authorIds) })
    : [];
  const authorNameById = new Map(authors.map((a) => [a.id, a.name]));

  const notes = noteRows.map((n) => ({
    id: n.id,
    content: n.content,
    authorName: authorNameById.get(n.authorUserId) ?? "Unknown",
    authorRole: n.authorRole,
    createdAt: n.createdAt,
  }));

  // Where the visit has got to, and which forms are still outstanding. Derived
  // from the forms, payments and prescriptions behind it — see
  // @workspace/db/visit-workflow.
  const visit = await visitState(db, {
    id: appointmentRow.id,
    contactId: appointmentRow.contactId,
  });

  // Therapy is not a type somebody picks — a visit is a therapy day because
  // a plan_sitting points at it. Without this the page reads the stored
  // type, which for a therapy day says "consultation".
  const [sittingRow] = await db
    .select()
    .from(planSitting)
    .where(eq(planSitting.appointmentId, id))
    .limit(1);

  const courseId = sittingRow?.enrollmentId ?? appointmentRow.enrollmentId ?? null;
  const [courseRow] = courseId
    ? await db.select().from(planEnrollment).where(eq(planEnrollment.id, courseId)).limit(1)
    : [];

  const [registrationRow] = await db
    .select({
      status: clinicalFormSubmission.status,
      answers: clinicalFormSubmission.answers,
    })
    .from(clinicalFormSubmission)
    .where(
      and(
        eq(clinicalFormSubmission.appointmentId, id),
        eq(clinicalFormSubmission.formKey, "registration_front_desk"),
      ),
    )
    .limit(1);

  const kind = visitKind({
    type: appointmentRow.type,
    sitting: sittingRow
      ? { dayNumber: sittingRow.dayNumber, enrollmentId: sittingRow.enrollmentId }
      : null,
    enrollment: courseRow
      ? { planName: courseRow.planName, sittings: courseRow.sittings }
      : null,
  });

  return NextResponse.json({
    appointment: appointmentRow,
    visit,
    kind,
    forms: (await formsForVisit(db, id)).map((row) => ({
      formKey: row.formKey,
      status: row.status,
      submittedAt: row.submittedAt,
    })),
    patient: patientRow ? { id: patientRow.id, name: patientRow.name, email: patientRow.email } : null,
    // Always present when the person is on record. `patient` only exists after
    // they have a login, so phone and the name typed at the desk live here —
    // otherwise a booked lead opens as a visit with nobody on it.
    contact: contactRow
      ? {
          id: contactRow.id,
          name: contactRow.name,
          phone: contactRow.phone,
          email: contactRow.email,
          stage: contactRow.stage,
        }
      : null,
    lead: !patientRow && contactRow
      ? { name: contactRow.name, phone: contactRow.phone, email: contactRow.email }
      : null,
    registration: registrationRow
      ? { status: registrationRow.status, answers: registrationRow.answers }
      : null,
    doctor: doctorRow ? { id: doctorRow.id, name: doctorRow.name } : null,
    reports: await withReadableUrls(reports),
    notes,
  });
}

// Marks attendance (status) and/or reschedules a visit. Kept as one
// endpoint since both are "update this appointment" ΓÇö a reschedule doesn't
// reset status on its own, staff can still flip it back to "scheduled"
// explicitly if that's what they mean.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireAppointmentManager();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }

  const existing = await db.query.appointment.findFirst({
    where: and(eq(appointment.id, id), appointmentInClinic(context.clinic.id)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (parsed.data.convertToPatient) {
    try {
      await convertContactToPatient(db, existing.contactId);
    } catch (error) {
      return NextResponse.json(
        { error: describeError(error, "Could not convert this person") },
        { status: 400 },
      );
    }
  }

  const touchesAppointment =
    parsed.data.status !== undefined ||
    parsed.data.scheduledAt !== undefined ||
    parsed.data.arrived !== undefined;

  if (!touchesAppointment) {
    return NextResponse.json({ converted: true });
  }

  const updates: { status?: string; scheduledAt?: Date; updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (parsed.data.status) {
    updates.status = parsed.data.status;
  }

  if (parsed.data.scheduledAt) {
    const scheduledAt = new Date(parsed.data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: "scheduledAt must be a valid date" }, { status: 400 });
    }
    updates.scheduledAt = scheduledAt;
  }

  const [updated] = await db
    .update(appointment)
    .set(updates)
    .where(eq(appointment.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Failed to update appointment" }, { status: 500 });
  }

  // The event and the contact's lifecycle stage both follow from the outcome,
  // and the same rules apply when the front desk marks attendance in the
  // operations console — so the logic lives in @workspace/db, not here.
  // A new time is its own moment: the patient is told (Stage Messages →
  // "Reschedule confirmation"), whatever else changed in the same save.
  if (updates.scheduledAt && updates.scheduledAt.getTime() !== existing.scheduledAt.getTime()) {
    await emitDomainEvent(
      db,
      DomainEventType.APPOINTMENT_RESCHEDULED,
      {
        appointmentId: id,
        scheduledAt: updated.scheduledAt.toISOString(),
        previousScheduledAt: existing.scheduledAt.toISOString(),
      },
      { contactId: updated.contactId },
    );
  }

  if (parsed.data.arrived !== undefined) {
    // Marked in error is the only reason to undo it. "They left" is what
    // status = completed records; clearing arrival on the way out would
    // throw away every waiting time the clinic could have measured.
    if (parsed.data.arrived) await markArrived(db, id);
    else await clearArrival(db, id);
  }

  if (parsed.data.status) {
    await applyAppointmentOutcome(db, {
      appointmentId: id,
      contactId: updated.contactId,
      status: parsed.data.status,
      scheduledAt: updated.scheduledAt,
      actorId: context.session.user.id,
    });
  }

  return NextResponse.json({ appointment: updated });
}

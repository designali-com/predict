import { NextResponse } from "next/server";
import { DomainEventType } from "@workspace/db/domain-events";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { db } from "@workspace/db/client";
import { appointment, appointmentNote, contact, user } from "@workspace/db/schema";
import { desc, eq } from "@workspace/db";
import { applyAppointmentOutcome } from "@workspace/db/appointment-outcome";
import { requireOperations } from "@/src/lib/auth/guards";

const STATUSES = ["scheduled", "confirmed", "in_consultation", "completed", "cancelled", "no_show"];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [row] = await db
    .select({
      id: appointment.id,
      contactId: appointment.contactId,
      contactName: contact.name,
      contactPhone: contact.phone,
      contactStage: contact.stage,
      doctorUserId: appointment.doctorUserId,
      doctorName: user.name,
      type: appointment.type,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
      notes: appointment.notes,
      channel: appointment.channel,
      meetingLocation: appointment.meetingLocation,
      calBookingUid: appointment.calBookingUid,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
    })
    .from(appointment)
    .leftJoin(contact, eq(appointment.contactId, contact.id))
    .leftJoin(user, eq(appointment.doctorUserId, user.id))
    .where(eq(appointment.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The clinician's write-up of the visit, newest first. Read-only here —
  // notes are authored in the clinical app, not at the front desk.
  const notes = await db
    .select({
      id: appointmentNote.id,
      authorRole: appointmentNote.authorRole,
      content: appointmentNote.content,
      createdAt: appointmentNote.createdAt,
      authorName: user.name,
    })
    .from(appointmentNote)
    .leftJoin(user, eq(appointmentNote.authorUserId, user.id))
    .where(eq(appointmentNote.appointmentId, id))
    .orderBy(desc(appointmentNote.createdAt));

  return NextResponse.json({ appointment: row, notes });
}

/**
 * Marking attendance, and rescheduling.
 *
 * The front desk is who actually knows whether someone walked in, so this has
 * to be reachable from the operations console and not only from the clinical
 * app. What follows from the outcome — the domain event, and moving the
 * contact between BOOKED / PATIENT / LEAD — is shared with that app rather
 * than reimplemented, so the two can't disagree about what a no-show means.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const status = typeof body?.status === "string" ? body.status : null;
  const scheduledAtRaw = typeof body?.scheduledAt === "string" ? body.scheduledAt : null;

  if (status !== null && !STATUSES.includes(status)) {
    return NextResponse.json({ error: `"${status}" is not a valid status` }, { status: 400 });
  }
  if (status === null && scheduledAtRaw === null) {
    return NextResponse.json({ error: "status or scheduledAt is required" }, { status: 400 });
  }

  const [existing] = await db.select().from(appointment).where(eq(appointment.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: { status?: string; scheduledAt?: Date; updatedAt: Date } = { updatedAt: new Date() };
  if (status !== null) updates.status = status;
  if (scheduledAtRaw !== null) {
    const scheduledAt = new Date(scheduledAtRaw);
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
  if (!updated) return NextResponse.json({ error: "Failed to update" }, { status: 500 });

  // A new time is its own moment: the patient is told (Stage Messages →
  // "Reschedule confirmation").
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

  // Only on an actual change of outcome — re-saving the same status would
  // otherwise emit a second APPOINTMENT_COMPLETED for one visit.
  let stageChangedTo: string | null = null;
  if (status !== null && status !== existing.status) {
    ({ stageChangedTo } = await applyAppointmentOutcome(db, {
      appointmentId: id,
      contactId: updated.contactId,
      status,
      scheduledAt: updated.scheduledAt,
      actorId: session.user.id,
    }));
  }

  return NextResponse.json({ appointment: updated, stageChangedTo });
}

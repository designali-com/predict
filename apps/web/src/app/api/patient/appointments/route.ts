import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import { appointment, user } from "@workspace/db/schema";
import { desc, eq, inArray } from "@workspace/db";
import { getOrCreateContactForUser } from "@/src/lib/contact";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { ensurePatientRecord } from "@workspace/db/patient-registry";
import { bookableDoctors, bookWithAnyDoctor, clinicAddressFor } from "@workspace/db/patient-booking";
import { notifyBookedVisit } from "@workspace/communication/visit-meet";

// GET: the current patient's own appointments, newest first.
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const patientContact = await getOrCreateContactForUser(session.user.id);

  const rows = await db.query.appointment.findMany({
    where: eq(appointment.contactId, patientContact.id),
    orderBy: [desc(appointment.scheduledAt)],
  });

  const doctorIds = [...new Set(rows.map((r) => r.doctorUserId).filter((id): id is string => Boolean(id)))];
  const doctors = doctorIds.length
    ? await db.query.user.findMany({ where: inArray(user.id, doctorIds) })
    : [];
  const doctorNameById = new Map(doctors.map((d) => [d.id, d.name]));

  const appointments = rows.map((r) => ({
    id: r.id,
    type: r.type,
    channel: r.channel,
    status: r.status,
    scheduledAt: r.scheduledAt,
    meetingLocation: r.meetingLocation,
    notes: r.notes,
    doctorName: r.doctorUserId ? (doctorNameById.get(r.doctorUserId) ?? null) : null,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ appointments });
}

const createSchema = z.object({
  date: z.string().min(1),
  startIso: z.string().min(1),
  channel: z.enum(["virtual", "in_clinic"]),
});

// POST: book a new appointment.
//
// The slot is ours to grant, from the doctors' own availability: it is
// re-checked under a lock and given to the first doctor who still has room
// (see @workspace/db/patient-booking). A virtual visit then gets a Meet link
// from the clinic's Google Calendar, and the confirmation goes out from
// EMAIL_FROM.
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
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

  const startDate = new Date(parsed.data.startIso);
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "startIso must be a valid date" }, { status: 400 });
  }

  const { channel } = parsed.data;
  const patientContact = await getOrCreateContactForUser(session.user.id);

  let created: typeof appointment.$inferSelect;
  try {
    const doctors = await bookableDoctors(db, patientContact.clinicId ?? null);
    if (!doctors.length) {
      return NextResponse.json({ error: "No doctor has set their consultation hours yet." }, { status: 409 });
    }
    const outcome = await bookWithAnyDoctor(db, {
      contactId: patientContact.id,
      start: startDate,
      channel,
      doctorUserIds: doctors,
      clinicId: patientContact.clinicId ?? null,
      meetingLocation: channel === "in_clinic" ? await clinicAddressFor(db, patientContact.clinicId ?? null) : null,
    });
    if ("error" in outcome) {
      return NextResponse.json({ error: outcome.error }, { status: 409 });
    }
    created = outcome.row;
  } catch (error) {
    console.error("[appointments] could not save the booking:", error);
    return NextResponse.json({ error: "Unable to complete booking. Please try again." }, { status: 500 });
  }

  const location = await notifyBookedVisit({
    appointmentId: created.id,
    clinicId: created.clinicId,
    channel,
    start: startDate,
    meetingLocation: created.meetingLocation,
    attendeeName: session.user.name ?? "Patient",
    attendeeEmail: session.user.email,
    doctorUserId: created.doctorUserId,
  });
  created = { ...created, meetingLocation: location };

  // A booked person is somebody notes, reports and therapy days will be filed
  // against, and all of that hangs off a chart. Outside the booking
  // transaction on purpose: if it fails the booking is still valid, and the
  // next call creates the chart.
  await ensurePatientRecord(db, patientContact.id);

  await emitDomainEvent(
    db,
    DomainEventType.APPOINTMENT_CREATED,
    {
      appointmentId: created.id,
      patientId: session.user.id,
      doctorUserId: created.doctorUserId,
      scheduledAt: created.scheduledAt,
      channel: created.channel,
      calBookingUid: created.calBookingUid,
    },
    { contactId: patientContact.id, idempotencyKey: `appointment_created:${created.id}` },
  );

  return NextResponse.json({ appointment: created }, { status: 201 });
}

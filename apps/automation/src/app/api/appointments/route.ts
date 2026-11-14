import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { appointment, patientRecord, contact, user } from "@workspace/db/schema";
import { and, asc, desc, eq, gte, ilike, lt, or, type SQL } from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { ensurePatientRecord } from "@workspace/db/patient-registry";
import { DomainEventType } from "@workspace/db/domain-events";
import { requireClinicAnyPermission } from "@/src/lib/auth/clinic";
import { OPS_KEYS } from "@workspace/db/permissions";
import { appointmentInClinic } from "@workspace/db/appointment-scope";

const LIST_LIMIT = 200;

/**
 * One joined query behind every appointment list in the console, narrowed by
 * whichever filters are passed:
 *
 *   ?contactId=...            one patient's appointments (the 360 card, and
 *                             the same page filtered to them)
 *   ?from=&to=                one day, earliest first (the Day view)
 *   ?when=upcoming|past|all   the filterable list, with status and search
 *
 * These used to be separate branches returning different row shapes, which
 * meant the per-patient list could only be assembled by fetching the global
 * list and filtering it in the browser — so a patient whose appointments fell
 * outside the first 200 rows simply had none. One query, one shape, filters
 * that compose.
 */
export async function GET(req: Request) {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const contactId = params.get("contactId");
  const from = params.get("from");
  const to = params.get("to");
  const when = params.get("when");

  const filters: SQL[] = [appointmentInClinic(context.clinic.id)];

  if (contactId) filters.push(eq(appointment.contactId, contactId));

  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json({ error: "from and to must be valid dates" }, { status: 400 });
    }
    filters.push(gte(appointment.scheduledAt, fromDate), lt(appointment.scheduledAt, toDate));
  } else if (!contactId || when) {
    // Default to upcoming for the global list — the reason to open it is
    // almost always something that has not happened yet. A patient's own list
    // defaults to everything, because their history is the point.
    const effective = when ?? (contactId ? "all" : "upcoming");
    const now = new Date();
    if (effective === "upcoming") filters.push(gte(appointment.scheduledAt, now));
    if (effective === "past") filters.push(lt(appointment.scheduledAt, now));
  }

  const status = params.get("status");
  if (status) filters.push(eq(appointment.status, status));

  const doctorUserId = params.get("doctorUserId");
  if (doctorUserId) filters.push(eq(appointment.doctorUserId, doctorUserId));

  const query = params.get("q")?.trim();
  if (query) {
    const like = `%${query}%`;
    const match = or(ilike(contact.name, like), ilike(contact.phone, like));
    if (match) filters.push(match);
  }

  // A day reads forwards. Anything anchored on a person, or looking backwards,
  // reads newest first — that is the end you start from.
  const newestFirst = !from && (Boolean(contactId) || when === "past" || when === "all");

  const appointments = await db
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
      channel: appointment.channel,
      notes: appointment.notes,
    })
    .from(appointment)
    .leftJoin(contact, eq(appointment.contactId, contact.id))
    .leftJoin(user, eq(appointment.doctorUserId, user.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(newestFirst ? desc(appointment.scheduledAt) : asc(appointment.scheduledAt))
    .limit(LIST_LIMIT);

  return NextResponse.json({
    appointments,
    truncated: appointments.length === LIST_LIMIT,
  });
}

export async function POST(req: Request) {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;
  const clinicId = context.clinic.id;

  const body = await req.json().catch(() => null);
  const contactId = typeof body?.contactId === "string" ? body.contactId : "";
  const scheduledAt = typeof body?.scheduledAt === "string" ? body.scheduledAt : "";
  const type = typeof body?.type === "string" && body.type ? body.type : "consultation";
  const notes = typeof body?.notes === "string" && body.notes ? body.notes : null;
  // Both were missing until now, so every appointment booked from the console
  // had no doctor against it — which is exactly the column the day's Schedule
  // renders, so it read "—" for every manually booked visit.
  const doctorUserId =
    typeof body?.doctorUserId === "string" && body.doctorUserId ? body.doctorUserId : null;
  const channel = typeof body?.channel === "string" && body.channel ? body.channel : null;

  if (!contactId || !scheduledAt) {
    return NextResponse.json({ error: "contactId and scheduledAt are required" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(appointment)
        // A booking happens at a place: the clinic the person booking it is
        // working in, which is also the clinic whose doctors and slots they
        // were shown.
        .values({ clinicId, contactId, scheduledAt: new Date(scheduledAt), type, notes, doctorUserId, channel })
        .returning();
      if (!row) throw new Error("Failed to create appointment");

      await emitDomainEvent(
        tx,
        DomainEventType.APPOINTMENT_CREATED,
        { contactId, appointmentId: row.id, scheduledAt, type },
        { contactId },
      );

      // A booking moves them to BOOKED, not PATIENT. That still stops the
      // nurture flows — their exit check is Load Contact + Check "still
      // LEAD?" — without claiming the person has been seen, which they
      // haven't. PATIENT is set when an appointment is marked completed.
      const [contactRow] = await tx.select().from(contact).where(eq(contact.id, contactId)).limit(1);
      if (contactRow && contactRow.stage === "LEAD") {
        await tx.update(contact).set({ stage: "BOOKED", leadStatus: "APPOINTMENT_BOOKED", leadStatusAt: new Date(), updatedAt: new Date() }).where(eq(contact.id, contactId));
        await emitDomainEvent(
          tx,
          DomainEventType.CONTACT_STAGE_CHANGED,
          { contactId, stage: "BOOKED" },
          { contactId },
        );
      }

      if (contactRow?.userId) {
        const [patientRow] = await tx
          .select()
          .from(patientRecord)
          .where(eq(patientRecord.userId, contactRow.userId))
          .limit(1);

        if (patientRow && !patientRow.onboardedAt) {
          const now = new Date();
          await tx.update(patientRecord).set({ onboardedAt: now, updatedAt: now }).where(eq(patientRecord.id, patientRow.id));
          await emitDomainEvent(
            tx,
            DomainEventType.PATIENT_ONBOARDED,
            { contactId, patientId: patientRow.id, onboardedAt: now.toISOString() },
            { contactId, idempotencyKey: `patient_onboarded:${patientRow.id}` },
          );
        }
      }

      return row;
    });

    // A booked person is somebody notes, reports and therapy days will be
    // filed against, and all of that hangs off a chart. Outside the
    // transaction on purpose: if it fails the booking is still valid, and the
    // next call creates the chart.
    await ensurePatientRecord(db, contactId);

    return NextResponse.json({ appointment: result }, { status: 201 });
  } catch (error) {
    console.error("Error creating appointment:", error);
    return NextResponse.json({ error: "Failed to create appointment" }, { status: 500 });
  }
}

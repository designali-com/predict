import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { appointment, contact } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { registerWalkIn, lookupByPhone } from "@workspace/db/patient-registry";
import { clinicContext } from "@/src/lib/auth/clinic";
import { requireAnyPermission } from "@/src/lib/auth/guards";

const GENDERS = ["MALE", "FEMALE", "OTHER"];

/**
 * Who is this number, before the receptionist finishes typing it.
 *
 * The point is to recognise a returning patient *while the form is open* —
 * after it is submitted is too late, because by then the choice between
 * "reuse their chart" and "create a second one" has already been made.
 */
export async function GET(req: Request) {
  const session = await requireAnyPermission(["ops.leads", "ops.patients"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const phone = new URL(req.url).searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "phone is required" }, { status: 400 });

  const match = await lookupByPhone(db, phone);
  return NextResponse.json({ match });
}

/**
 * Register a walk-in and book them in, in one action.
 *
 * These are one action at the counter and should be one here too: a patient
 * registered but not booked is a chart nobody asked for, and a booking against
 * a half-created patient is worse. The identity work is transactional inside
 * registerWalkIn; the booking that follows is what moves the contact to
 * BOOKED, so the stage can never claim an appointment that does not exist.
 */
export async function POST(req: Request) {
  const session = await requireAnyPermission(["ops.leads", "ops.patients"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone : "";
  const dateOfBirth = typeof body?.dateOfBirth === "string" ? body.dateOfBirth : "";
  const gender = typeof body?.gender === "string" ? body.gender.toUpperCase() : "";
  const scheduledAt = typeof body?.scheduledAt === "string" ? body.scheduledAt : "";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Mobile number is required" }, { status: 400 });
  if (!dateOfBirth) return NextResponse.json({ error: "Date of birth is required" }, { status: 400 });
  if (!GENDERS.includes(gender)) {
    return NextResponse.json({ error: "Pick a gender" }, { status: 400 });
  }
  if (!scheduledAt) {
    return NextResponse.json({ error: "Appointment date and time is required" }, { status: 400 });
  }

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "Appointment date is not valid" }, { status: 400 });
  }

  const clinicId = (await clinicContext())?.clinic.id ?? null;

  let registration;
  try {
    registration = await registerWalkIn(db, {
      clinicId,
      name,
      phone,
      email: typeof body?.email === "string" ? body.email : null,
      dateOfBirth,
      gender,
      bloodGroup: typeof body?.bloodGroup === "string" && body.bloodGroup ? body.bloodGroup : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not register this patient" },
      { status: 400 },
    );
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(appointment)
      .values({
        clinicId,
        contactId: registration.contactId,
        scheduledAt: when,
        type: typeof body?.type === "string" && body.type ? body.type : "consultation",
        doctorUserId:
          typeof body?.doctorUserId === "string" && body.doctorUserId ? body.doctorUserId : null,
        channel: typeof body?.channel === "string" && body.channel ? body.channel : "in_clinic",
        notes: typeof body?.notes === "string" && body.notes ? body.notes : null,
      })
      .returning();
    if (!row) throw new Error("Failed to create appointment");

    await emitDomainEvent(
      tx,
      DomainEventType.APPOINTMENT_CREATED,
      { contactId: registration.contactId, appointmentId: row.id, scheduledAt, source: "walk_in" },
      { contactId: registration.contactId },
    );

    // Same rule as every other booking: BOOKED, not PATIENT. Walking in is
    // not the same as having been seen, and the visit still has to be marked
    // completed for that.
    const [contactRow] = await tx
      .select()
      .from(contact)
      .where(eq(contact.id, registration.contactId))
      .limit(1);

    if (contactRow && contactRow.stage === "LEAD") {
      await tx
        .update(contact)
        .set({ stage: "BOOKED", leadStatus: "APPOINTMENT_BOOKED", leadStatusAt: new Date(), updatedAt: new Date() })
        .where(eq(contact.id, registration.contactId));
      await emitDomainEvent(
        tx,
        DomainEventType.CONTACT_STAGE_CHANGED,
        { contactId: registration.contactId, stage: "BOOKED" },
        { contactId: registration.contactId },
      );
    }

    return row;
  });

  return NextResponse.json(
    {
      contactId: registration.contactId,
      patientCode: registration.patientCode,
      appointmentId: created.id,
      isReturning: registration.isReturning,
      matchedExistingContact: registration.matchedExistingContact,
    },
    { status: 201 },
  );
}

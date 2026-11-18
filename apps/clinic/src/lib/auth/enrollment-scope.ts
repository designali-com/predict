import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { appointment, contact, therapyBooking } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { enrollmentOwner, sittingOwner } from "@workspace/db/enrollment-service";
import { isPartnerClinic, type Clinic } from "@workspace/db/clinic-service";

/**
 * The wall around one clinic's therapy courses.
 *
 * Every course route takes an id from the URL or the body, and until now
 * trusted whoever held the page permission with it — so a desk at one clinic
 * could cancel, discount or log a sitting on another clinic's patient by
 * pasting an id. These check the record against the clinic the caller is
 * acting inside, and answer 404 rather than 403: another clinic's course is
 * not something this clinic gets to learn exists.
 *
 * A record with no clinic at all — a contact from before clinics, a course
 * whose patient has none — stays visible to Predict's own clinics, as it is
 * everywhere else, and never to a partner hospital.
 */
function belongsHere(clinicId: string | null, clinic: Clinic): boolean {
  if (clinicId) return clinicId === clinic.id;
  return !isPartnerClinic(clinic);
}

/** Whether this contact is one the active clinic may act on. */
export async function contactInClinic(contactId: string, clinic: Clinic): Promise<boolean> {
  const [person] = await db
    .select({ clinicId: contact.clinicId })
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);
  return Boolean(person) && belongsHere(person!.clinicId, clinic);
}

/** For a route: a 404 if this contact is not the active clinic's, else null. */
export async function guardContact(contactId: string, clinic: Clinic): Promise<NextResponse | null> {
  return (await contactInClinic(contactId, clinic))
    ? null
    : NextResponse.json({ error: "No such patient." }, { status: 404 });
}

/** For a route: a 404 if this course is not the active clinic's, else null. */
export async function guardEnrollment(enrollmentId: string, clinic: Clinic): Promise<NextResponse | null> {
  const owner = enrollmentId ? await enrollmentOwner(db, enrollmentId) : null;
  return owner && belongsHere(owner.clinicId, clinic)
    ? null
    : NextResponse.json({ error: "That course no longer exists." }, { status: 404 });
}

/**
 * For a route: a 404 if this visit is not the active clinic's — a course
 * prescribed "from" another clinic's appointment would tie the two together.
 * No id, nothing to check.
 */
export async function guardAppointmentId(appointmentId: string | null | undefined, clinic: Clinic): Promise<NextResponse | null> {
  if (!appointmentId) return null;
  const [visit] = await db
    .select({ clinicId: appointment.clinicId })
    .from(appointment)
    .where(eq(appointment.id, appointmentId))
    .limit(1);
  return visit && belongsHere(visit.clinicId, clinic)
    ? null
    : NextResponse.json({ error: "That visit does not exist." }, { status: 404 });
}

/** For a route: a 404 if this therapy booking is not the active clinic's. No id, nothing to check. */
export async function guardBookingId(bookingId: string | null | undefined, clinic: Clinic): Promise<NextResponse | null> {
  if (!bookingId) return null;
  const [booking] = await db
    .select({ clinicId: therapyBooking.clinicId })
    .from(therapyBooking)
    .where(eq(therapyBooking.id, bookingId))
    .limit(1);
  return booking && belongsHere(booking.clinicId, clinic)
    ? null
    : NextResponse.json({ error: "That booking does not exist." }, { status: 404 });
}

/** For a route: a 404 if this therapy day is not on one of the active clinic's courses, else null. */
export async function guardSitting(sittingId: string, clinic: Clinic): Promise<NextResponse | null> {
  const owner = sittingId ? await sittingOwner(db, sittingId) : null;
  return owner && belongsHere(owner.clinicId, clinic)
    ? null
    : NextResponse.json({ error: "That therapy day does not exist." }, { status: 404 });
}

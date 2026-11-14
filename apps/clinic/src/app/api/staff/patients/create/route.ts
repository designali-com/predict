import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { contact } from "@workspace/db/schema";
import { and, eq, ne } from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { PatientAtAnotherClinicError, registerWalkIn } from "@workspace/db/patient-registry";
import { toStoredPhone } from "@workspace/db/normalize-phone";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";
import { isPartnerClinic } from "@workspace/db/clinic-service";
import { STUB_DATE_OF_BIRTH } from "@workspace/db/registration-sync";

/**
 * Register a patient at the desk, and optionally give them a login.
 *
 * Until now a chart could only come into existence by booking a visit, and a
 * login only by an admin creating a user on the Team page — where the patient
 * role is deliberately not offered, so in practice it could not be done at
 * all. That left the common case with no route through the product: the
 * clinic runs a round of blood tests, and every one of those people needs a
 * chart to file the results against and a login to read them.
 *
 * The chart goes through registerWalkIn, the same primitive the counter uses,
 * so identity stays keyed on the mobile number: somebody already known comes
 * back with the chart they already have rather than a second one.
 */

const bodySchema = z.object({
  name: z.string().trim().min(1, "A name is required"),
  phone: z.string().trim().min(6, "A mobile number is required"),
  // Optional: an exact date, or just the age in years, or neither.
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be yyyy-mm-dd")
    .optional()
    .nullable(),
  age: z.number().int().min(0, "Age can't be negative").max(120, "Check the age").optional().nullable(),
  gender: z.string().trim().min(1, "Sex is required"),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  bloodGroup: z.string().trim().optional().nullable(),
  /** Whether to create an app login — from the mobile number; email is optional. */
  createLogin: z.boolean().optional(),
});

/** "Dr. Prashun  Chattarjee" and "prashun chattarjee" are the same person. */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/^(dr|mr|mrs|ms|miss)\.?\s+/, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  const context = await requireClinicApiPermission("clinic.patients");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid details", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, phone, gender, bloodGroup } = parsed.data;
  // The chart needs a date: the one given, one worked back from the age
  // (today, that many years ago), or the "not known" stub every age-dependent
  // feature already treats as missing.
  const dateOfBirth =
    parsed.data.dateOfBirth ||
    (parsed.data.age != null ? birthDateFromAge(parsed.data.age) : STUB_DATE_OF_BIRTH);
  const email = parsed.data.email?.trim().toLowerCase() || null;

  try {
    // Who this number already belonged to, read before registering, because
    // registration attaches the chart to that same person. The mobile number
    // is the identity — right for a returning patient, wrong when two people
    // were given one number (a family phone, or a placeholder like
    // 9876543210 typed in for testing). Either way the desk has to be told
    // at the moment it happens, not find a stranger's name on the chart later.
    const lookupPhone = toStoredPhone(phone);
    const priorContact = lookupPhone
      ? await db.query.contact.findFirst({
          columns: { name: true, stage: true, clinicId: true },
          where: eq(contact.phone, lookupPhone),
        })
      : null;

    // A partner hospital cannot take over somebody Predict (or another
    // hospital) already holds: registering would attach the chart to that
    // person, in their clinic, out of this doctor's sight — and show them a
    // stranger's history if it did not.
    if (isPartnerClinic(context.clinic) && priorContact && priorContact.clinicId !== context.clinic.id) {
      return NextResponse.json(
        {
          error:
            "This mobile number is already registered with Predict. Ask the Predict team to link this patient to your hospital.",
        },
        { status: 409 },
      );
    }

    // The same wall between any two clinics: a number another clinic holds is
    // its patient. One nobody holds yet is registered here and becomes ours.
    if (priorContact?.clinicId && priorContact.clinicId !== context.clinic.id) {
      return NextResponse.json(
        { error: "This mobile number is a patient at another clinic." },
        { status: 409 },
      );
    }

    const registered = await registerWalkIn(db, {
      clinicId: context.clinic.id,
      name,
      phone,
      email,
      dateOfBirth,
      gender,
      bloodGroup: bloodGroup || null,
    });

    // Registered here, they are a patient — not a lead. registerWalkIn leaves
    // a new contact as LEAD (right for the lead desk's walk-in, where the
    // booking is what converts them), which put everyone added on this page on
    // the Leads list, in the call queue and in lead nurture, and never on
    // Patients. Nothing demotes a PATIENT back: a no-show only moves BOOKED.
    const [promoted] = await db
      .update(contact)
      .set({ stage: "PATIENT", updatedAt: new Date() })
      .where(and(eq(contact.id, registered.contactId), ne(contact.stage, "PATIENT")))
      .returning({ id: contact.id });
    if (promoted) {
      await emitDomainEvent(
        db,
        DomainEventType.CONTACT_STAGE_CHANGED,
        { contactId: registered.contactId, stage: "PATIENT" },
        { contactId: registered.contactId },
      );
    }

    // No login here. Registering a patient is not giving them the app: staff
    // create the login from the patient's record (Patient app access) when
    // they should have it, and send the sign-in link from there.
    const loginCreated = false;
    const loginNote: string | null = null;

    return NextResponse.json(
      {
        patientId: registered.patientId,
        patientCode: registered.patientCode,
        contactId: registered.contactId,
        isReturning: registered.isReturning,
        loginCreated,
        loginNote,
        // Set when the number was already on file under a different name.
        matchedContactName:
          priorContact?.name && normalizeName(priorContact.name) !== normalizeName(name)
            ? priorContact.name
            : null,
      },
      { status: 201 },
    );
  } catch (error) {
    // Claimed by another clinic between the check above and the write.
    if (error instanceof PatientAtAnotherClinicError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to register patient:", error);
    return NextResponse.json(
      { error: describeError(error, "Could not register this patient") },
      { status: 500 },
    );
  }
}

/** A birth date that makes someone `age` today (India time) — for a patient who gave only their age. */
function birthDateFromAge(age: number): string {
  const today = new Date(Date.now() + 330 * 60_000);
  const year = today.getUTCFullYear() - age;
  const md = today.toISOString().slice(5, 10);
  // 29 Feb in a year without one.
  return md === "02-29" && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? `${year}-02-28` : `${year}-${md}`;
}

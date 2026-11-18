import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import {
  activateEnrollment,
  enrollmentsForContact,
  prescribePlan,
  setEnrollmentDiscount,
  type DiscountInput,
} from "@workspace/db/enrollment-service";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { guardAppointmentId, guardContact, guardEnrollment } from "@/src/lib/auth/enrollment-scope";
import { resolveContactId } from "@/src/lib/contact-ref";
import { describeError } from "@/src/lib/api-error";
import { formOwnersFor, mayPrescribe } from "@workspace/db/clinical-forms";
import { grantedPermissions, isUnrestricted } from "@workspace/db/permission-service";
import { denyPartner } from "@/src/lib/auth/patient-scope";

// Reading a patient's courses is for anyone with the chart open — the front
// desk has to see what was prescribed to take money for it.
const CAN_READ = ["clinic.patients", "clinic.appointments", "clinic.treatment_plans"];

/**
 * Prescribing is not reading.
 *
 * Choosing the package is the clinical decision that ends the doctor's part
 * of the visit — it is what moves it from "assessed" to the nutritionist. The
 * doctor makes it; the front desk may write it up, as OPTM's receptionist did
 * in the clinic's old system. The nutritionist does not. See PRESCRIBERS.
 *
 * Not its own permission because the registry is page-shaped and this is an
 * action, not a page: it follows the visit's form owners.
 */
async function canPrescribe(user: { id: string; role?: string | null }): Promise<boolean> {
  const role = user.role ?? "";
  const held = new Set(await grantedPermissions(db, user));
  return mayPrescribe(formOwnersFor(role, held, isUnrestricted(role)));
}

export async function GET(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(CAN_READ);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const contactId = await resolveContactId({
    contactId: url.searchParams.get("contactId"),
    userId: url.searchParams.get("userId"),
  });

  // No contact row is not an error — a patient account that has never been
  // touched by the CRM simply has no courses yet, and an empty panel says that
  // better than a failure does.
  if (!contactId) return NextResponse.json({ contactId: null, enrollments: [] });
  const elsewhere = await guardContact(contactId, context.clinic);
  if (elsewhere) return elsewhere;

  const [person] = await db.select({ name: contact.name }).from(contact).where(eq(contact.id, contactId)).limit(1);
  return NextResponse.json({
    contactId,
    contactName: person?.name ?? null,
    enrollments: await enrollmentsForContact(db, contactId),
  });
}

export async function POST(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(CAN_READ);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;

  if (!(await canPrescribe(session.user))) {
    return NextResponse.json(
      { error: "Only the doctor or the front desk prescribes a package." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const contactId = await resolveContactId({
    contactId: body?.contactId,
    userId: body?.userId,
  });
  if (!contactId) {
    return NextResponse.json(
      { error: "No contact record for this person — they cannot be enrolled yet." },
      { status: 400 },
    );
  }
  const elsewhere =
    (await guardContact(contactId, context.clinic)) ?? (await guardAppointmentId(body?.appointmentId, context.clinic));
  if (elsewhere) return elsewhere;

  try {
    // Prescribing is not enrolling. At this point the doctor has chosen a
    // package: nothing is scheduled, nothing is owed and the patient has not
    // agreed — they still see the nutritionist and then the desk. Writing
    // sittings here would put days on a log sheet for a course that may never
    // be bought, and moving them to PATIENT would claim a conversion the
    // clinic has not made.
    //
    // The button that used to be here called enrollInPlan, which did all of
    // that in one step and skipped the advance entirely.
    const enrollment = await prescribePlan(db, {
      contactId,
      clinicId: context.clinic.id,
      treatmentPlanId: String(body?.treatmentPlanId ?? ""),
      appointmentId: body?.appointmentId ?? null,
      discount: discountFrom(body?.discount),
      priceInPaise:
        body?.priceInRupees === undefined || body?.priceInRupees === null || body?.priceInRupees === ""
          ? null
          : Math.round(Number(body.priceInRupees) * 100),
      notes: body?.notes,
      actorId: session.user.id,
    });

    return NextResponse.json({ enrollment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not prescribe that plan") },
      { status: 400 },
    );
  }
}

/** `{ mode: "amount" | "percent", value, reason }` from the browser, or null. */
function discountFrom(raw: unknown): DiscountInput | null {
  const d = (raw ?? null) as { mode?: unknown; value?: unknown; reason?: unknown } | null;
  if (!d) return null;
  const value = Number(d.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  return {
    mode: d.mode === "percent" ? "percent" : "amount",
    value,
    reason: typeof d.reason === "string" ? d.reason.slice(0, 200) : null,
  };
}

/**
 * Change the discount on an existing course — `{ enrollmentId, discount }`,
 * where a null or zero discount takes it away.
 *
 * The doctor who prescribes and the desk that takes the money can both: the
 * discount is usually agreed at the counter, after the prescription.
 */
export async function PATCH(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(CAN_READ);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;

  const held = new Set(await grantedPermissions(db, session.user));
  if (!held.has("clinic.billing") && !(await canPrescribe(session.user))) {
    return NextResponse.json({ error: "Only the doctor or the front desk can change a discount." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const enrollmentId = String(body?.enrollmentId ?? "");
  const elsewhere = await guardEnrollment(enrollmentId, context.clinic);
  if (elsewhere) return elsewhere;
  try {
    const enrollment = await setEnrollmentDiscount(db, {
      enrollmentId,
      discount: discountFrom(body?.discount),
      actorId: session.user.id,
    });
    return NextResponse.json({ enrollment });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not change the discount") }, { status: 400 });
  }
}

/**
 * Start a prescribed course: lay out the sittings and make them a patient.
 *
 * Separate from prescribing because the advance sits between the two. The
 * service refuses below it; overrideAdvance exists because a clinic sometimes
 * has a reason, and a rule with no way round it gets worked around by entering
 * a payment that never happened — which is worse, because then the ledger lies.
 */
export async function PUT(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(CAN_READ);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const enrollmentId = String(body?.enrollmentId ?? "");
  const elsewhere = await guardEnrollment(enrollmentId, context.clinic);
  if (elsewhere) return elsewhere;

  try {
    const result = await activateEnrollment(db, {
      enrollmentId,
      startDate: String(body?.startDate ?? ""),
      mode: body?.mode,
      overrideAdvance: body?.overrideAdvance === true,
      actorId: context.session.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not start that course") },
      { status: 400 },
    );
  }
}

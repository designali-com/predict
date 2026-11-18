import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { perSessionPlans, recordWalkInSession } from "@workspace/db/walk-in";
import { registerWalkIn } from "@workspace/db/patient-registry";
import { applyRegistrationToChart } from "@workspace/db/registration-sync";
import { requireApiPermission } from "@/src/lib/auth/permissions";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { contactInClinic } from "@/src/lib/auth/enrollment-scope";
import { describeError } from "@/src/lib/api-error";

/**
 * Therapy taken and paid for on the spot.
 *
 * Gated on billing rather than on the chart, because that is what this is: a
 * patient who walked in, had therapy, and paid for it. The session, the money
 * and the medicine all move together — one request, so a therapy day cannot be
 * recorded with nobody having paid for it, or the reverse.
 */
export async function GET() {
  const session = await requireApiPermission("clinic.billing");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ plans: await perSessionPlans(db) });
}

export async function POST(req: Request) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;

  const body = await req.json().catch(() => null);

  /**
   * A first-time walk-in has no contact to attach a session to.
   *
   * So the identity is taken here, in the same request as the therapy and the
   * money. Registering them in a separate step would leave a chart behind
   * whenever the session failed — a patient id issued to somebody who never
   * had treatment.
   */
  let contactId = String(body?.contactId ?? "");
  let patientCode: string | null = null;

  const details = body?.patient;
  if (!contactId && details) {
    const name = String(details.name ?? "").trim();
    const phone = String(details.phone ?? "").trim();
    if (!name || !phone) {
      return NextResponse.json({ error: "A name and a mobile number are needed." }, { status: 400 });
    }

    try {
      const registered = await registerWalkIn(db, {
        clinicId: context.clinic.id,
        name,
        phone,
        email: details.email || null,
        // The chart requires both. The counter is asked for them on this
        // form, and the stubs only stand in when somebody genuinely does not
        // know — see ensurePatientRecord for the same pair.
        dateOfBirth: details.dob || "1900-01-01",
        // UNKNOWN, not OTHER: OTHER is a real answer, and a counter that
        // skipped the question has not given one.
        gender: details.gender || "UNKNOWN",
      });

      contactId = registered.contactId;
      patientCode = registered.patientCode;

      // Through the same function a submitted registration form uses, so the
      // chart and the address are written one way rather than two.
      await applyRegistrationToChart(db, {
        contactId,
        answers: {
          first_name: name.split(" ")[0],
          last_name: name.split(" ").slice(1).join(" "),
          dob: details.dob,
          sex: details.sex,
          phone_no: phone,
          address_line1: details.addressLine1,
          address_line2: details.addressLine2,
          city: details.city,
          state: details.state,
          pin_code: details.pincode,
        },
      });
    } catch (error) {
      // A number already registered at another clinic comes back with its own
      // status (409); everything else is a problem with what was typed.
      const status = (error as { status?: unknown })?.status;
      return NextResponse.json(
        { error: describeError(error, "Could not register that patient") },
        { status: typeof status === "number" && status >= 400 && status < 500 ? status : 400 },
      );
    }
  }

  if (!contactId) return NextResponse.json({ error: "Which patient?" }, { status: 400 });
  // A patient picked from the list must be this clinic's — the id came from
  // the browser, and another clinic's patient is not ours to bill.
  if (!(await contactInClinic(contactId, context.clinic))) {
    return NextResponse.json({ error: "No such patient." }, { status: 404 });
  }

  const rupees = body?.amountInRupees;
  const amountInPaise =
    rupees === undefined || rupees === null || rupees === ""
      ? null
      : Math.round(Number(rupees) * 100);

  try {
    const result = await recordWalkInSession(db, {
      contactId,
      clinicId: context.clinic.id,
      treatmentPlanId: String(body?.treatmentPlanId ?? ""),
      date: body?.date || undefined,
      mode: body?.mode || undefined,
      amountInPaise,
      method: body?.method,
      reference: body?.reference,
      note: body?.note,
      actorId: session.user.id,
    });

    // The code from registration when this call made the chart; otherwise the
    // one the session found or created.
    return NextResponse.json({ ...result, patientCode: result.patientCode ?? patientCode }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not record that session") },
      { status: 400 },
    );
  }
}

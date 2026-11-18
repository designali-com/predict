import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { loadForm, saveForm, submitForm } from "@workspace/db/form-service";
import { formByKey, FORM_WRITE_PERMISSIONS } from "@workspace/db/clinical-forms";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";
import { describeError } from "@/src/lib/api-error";
import { guardAppointment, guardPatient } from "@/src/lib/auth/patient-scope";

/**
 * Which permissions may touch which form.
 *
 * Keyed on the form's owner rather than on the form: the front desk fills page
 * one of the registration, the doctor fills the rest, and a receptionist should
 * not be able to submit a provisional diagnosis by posting a different formKey.
 * Everyone with a clinical page can READ everything — a nutritionist needs the
 * doctor's measurements in front of them — but writing is bounded by the job.
 */

const READ_PERMISSIONS = ["clinic.patients", "clinic.appointments", "clinic.schedule"];

export async function GET(req: Request) {
  const session = await requireApiAnyPermission(READ_PERMISSIONS);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const formKey = url.searchParams.get("formKey") ?? "";
  const appointmentId = url.searchParams.get("appointmentId");
  const contactId = url.searchParams.get("contactId") ?? undefined;
  {
    const blocked = await (contactId ? guardPatient(contactId) : guardAppointment(appointmentId));
    if (blocked) return blocked;
  }

  try {
    return NextResponse.json(await loadForm(db, { formKey, appointmentId, contactId }));
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Unknown form") }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const formKey = typeof body?.formKey === "string" ? body.formKey : "";

  const form = formByKey(formKey);
  if (!form) return NextResponse.json({ error: "Unknown form" }, { status: 400 });

  const session = await requireApiAnyPermission(
    FORM_WRITE_PERMISSIONS[form.owner] ?? READ_PERMISSIONS,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = {
    contactId: String(body?.contactId ?? ""),
    appointmentId: body?.appointmentId ?? null,
    formKey,
    answers: (body?.answers ?? {}) as Record<string, unknown>,
    actorId: session.user.id,
    // Trusted no further than the service, which checks the shape, the size
    // and that a first submission carries one at all.
    consent: body?.consent ?? null,
  };
  if (!payload.contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }
  {
    const blocked = await guardPatient(payload.contactId);
    if (blocked) return blocked;
  }

  try {
    // Submitting is what advances the visit; saving only keeps the typing.
    const submission =
      body?.submit === true ? await submitForm(db, payload) : await saveForm(db, payload);
    return NextResponse.json({ submission });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not save this form") },
      { status: 400 },
    );
  }
}

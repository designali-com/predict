import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { updatePersonDetails } from "@workspace/db/patient-details";
import { requireClinicAnyPermission } from "@/src/lib/auth/clinic";
import { OPS_KEYS } from "@workspace/db/permissions";
import { canSeeLead, leadScope } from "@/src/lib/lead-access";
import { sideForStage } from "@workspace/db/contact-side";

/** Name, mobile, email and chart facts, edited from the contact page. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [person] = await db.select().from(contact).where(eq(contact.id, id)).limit(1);
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (person.clinicId && person.clinicId !== context.clinic.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scope = await leadScope(context.principal);
  if (sideForStage(person.stage) === "leads" && !(await canSeeLead(scope, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    phone?: unknown;
    email?: unknown;
    city?: unknown;
    dateOfBirth?: unknown;
    gender?: unknown;
    bloodGroup?: unknown;
  } | null;

  const result = await updatePersonDetails(db, {
    contactId: id,
    name: typeof body?.name === "string" ? body.name : "",
    phone: typeof body?.phone === "string" ? body.phone : "",
    email: typeof body?.email === "string" ? body.email : null,
    ...(typeof body?.city === "string" ? { city: body.city } : {}),
    ...(typeof body?.dateOfBirth === "string" ? { dateOfBirth: body.dateOfBirth } : {}),
    ...(typeof body?.gender === "string" ? { gender: body.gender } : {}),
    ...(typeof body?.bloodGroup === "string" ? { bloodGroup: body.bloodGroup } : {}),
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, treatmentPlan } from "@workspace/db/schema";
import { asc, eq } from "@workspace/db";
import { enrollInPlan, enrollmentsForContact } from "@workspace/db/enrollment-service";
import { requireClinicAnyPermission } from "@/src/lib/auth/clinic";

// Both lists, because enrolling is the act that converts a lead: the person
// doing it is on the lead side right up until the moment it succeeds.
const CAN_ENROL = ["ops.leads", "ops.patients"];

/** Another clinic's contact is not this one's to see or sell to; no clinic is anyone's. */
async function elsewhere(contactId: string, clinicId: string): Promise<NextResponse | null> {
  const row = await db.query.contact.findFirst({ columns: { clinicId: true }, where: eq(contact.id, contactId) });
  if (!row || (row.clinicId && row.clinicId !== clinicId)) {
    return NextResponse.json({ error: "No such contact." }, { status: 404 });
  }
  return null;
}

/**
 * One contact's therapy courses, and the catalogue to sell them another.
 *
 * The clinic panel has the same screen keyed on a login. This one is keyed on
 * the contact, which is the row an offline patient actually has — they were
 * registered at the counter, they have a chart and a course, and they may
 * never sign in. Without this the log sheet would be unreachable for most of
 * the people on it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicAnyPermission(CAN_ENROL);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const refused = await elsewhere(id, context.clinic.id);
  if (refused) return refused;

  return NextResponse.json({
    courses: await enrollmentsForContact(db, id),
    plans: await db
      .select()
      .from(treatmentPlan)
      .where(eq(treatmentPlan.isActive, true))
      .orderBy(asc(treatmentPlan.sortOrder), asc(treatmentPlan.name)),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // The clinic as well as the person: the course is sold by the clinic they
  // are working in, and is that clinic's from here on.
  const context = await requireClinicAnyPermission(CAN_ENROL);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;

  const { id } = await params;
  const refused = await elsewhere(id, context.clinic.id);
  if (refused) return refused;
  const body = await req.json().catch(() => null);

  try {
    const result = await enrollInPlan(db, {
      contactId: id,
      clinicId: context.clinic.id,
      treatmentPlanId: String(body?.treatmentPlanId ?? ""),
      startDate: String(body?.startDate ?? ""),
      // Rupees at the form, paise in the column.
      priceInPaise:
        body?.priceInRupees === undefined || body?.priceInRupees === null || body?.priceInRupees === ""
          ? null
          : Math.round(Number(body.priceInRupees) * 100),
      mode: body?.mode,
      notes: body?.notes,
      actorId: session.user.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not enrol this patient" },
      { status: 400 },
    );
  }
}

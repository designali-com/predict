import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, patientRecord } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { patientSummary } from "@workspace/db/patient-summary";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";
import { guardPatient } from "@/src/lib/auth/patient-scope";

/**
 * GET — the patient's assessment summary: visit forms, measurements, VALD,
 * and the exercise and diet plan, gathered for the Summary screen. The id may
 * be the chart's or the contact's.
 */

const PERMS = ["clinic.patients", "clinic.appointments"];

async function contactIdFor(id: string) {
  const chart = await db.query.patientRecord.findFirst({ where: eq(patientRecord.id, id) });
  return (
    chart?.contactId ??
    (await db.query.contact.findFirst({ columns: { id: true }, where: eq(contact.id, id) }))?.id ??
    null
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(PERMS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor((await params).id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });
  try {
    return NextResponse.json(await patientSummary(db, contactId));
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not build the summary") }, { status: 500 });
  }
}

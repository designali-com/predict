import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, patientRecord } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { getDietProtocol, saveDietProtocol } from "@workspace/db/diet-protocol-store";
import { requireClinicApiAnyPermission, requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";
import { guardPatient } from "@/src/lib/auth/patient-scope";

/**
 * The nutritionist's dietary protocol for one patient.
 *
 * GET  the protocol as saved, or null
 * PUT  save it — the patient sees this version on their dashboard
 *
 * The id may be the chart's or the contact's, like the rules-plan route.
 */

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
  const context = await requireClinicApiAnyPermission(["clinic.patients", "clinic.appointments"]);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor((await params).id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });
  return NextResponse.json(await getDietProtocol(db, contactId));
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiPermission("clinic.patients");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor((await params).id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  try {
    const saved = await saveDietProtocol(db, contactId, await req.json().catch(() => null), {
      id: context.session.user.id,
      name: context.session.user.name,
    });
    return NextResponse.json(saved);
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not save the protocol") }, { status: 400 });
  }
}

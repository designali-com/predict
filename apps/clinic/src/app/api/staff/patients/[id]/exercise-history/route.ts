import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, patientRecord } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { getExerciseHistory, saveExerciseHistory } from "@workspace/db/exercise-history";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";
import { guardPatient } from "@/src/lib/auth/patient-scope";

/**
 * What exercise the patient does now, asked before prescribing.
 *
 * GET  { history } — what was recorded, or null
 * PUT  save it (replaces what was there)
 *
 * Same permissions as the prescription (../exercise); the id may be the
 * chart's or the contact's.
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
  return NextResponse.json({ history: await getExerciseHistory(db, contactId) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(PERMS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor((await params).id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  try {
    const history = await saveExerciseHistory(db, contactId, await req.json().catch(() => null), {
      id: context.session.user.id,
      name: context.session.user.name,
    });
    return NextResponse.json({ history });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not save") }, { status: 400 });
  }
}

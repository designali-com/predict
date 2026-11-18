import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, patientRecord } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { ExerciseAiError, generateExerciseProtocol } from "@workspace/db/exercise-ai";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { guardPatient } from "@/src/lib/auth/patient-scope";

/**
 * Auto-prescribe: a home exercise prescription written by AI from this
 * patient's diagnosis, measurements, questionnaires and DynaMo results, for
 * their running course's length.
 *
 * POST → { protocol, reasoning, model }
 *
 * Nothing is saved — it comes back for the doctor to check, change and save
 * as a draft, then activate. See @workspace/db/exercise-ai.
 */
export const maxDuration = 120;

const PERMS = ["clinic.patients", "clinic.appointments"];

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const blocked = await guardPatient(id);
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(PERMS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chart = await db.query.patientRecord.findFirst({ where: eq(patientRecord.id, id) });
  const contactId =
    chart?.contactId ?? (await db.query.contact.findFirst({ columns: { id: true }, where: eq(contact.id, id) }))?.id ?? null;
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  try {
    return NextResponse.json(await generateExerciseProtocol(db, contactId));
  } catch (error) {
    if (error instanceof ExerciseAiError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[exercise-ai]", error);
    return NextResponse.json({ error: "Could not write the prescription — try again." }, { status: 500 });
  }
}

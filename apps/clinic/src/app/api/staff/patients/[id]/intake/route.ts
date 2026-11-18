import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, patientRecord } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { IntakeValidationError, getIntake, saveIntake } from "@workspace/db/patient-intake-store";
import { refreshPatientPlan } from "@workspace/db/diet-plan-store";
import type { IntakeAnswers } from "@workspace/db/patient-intake";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { guardPatient } from "@/src/lib/auth/patient-scope";

/**
 * The plan questionnaire — the same questions the patient answers on their
 * dashboard under Personalised Plan.
 *
 * GET  { intake } — the answers, or null
 * PUT  { answers, submit? } — answered at the clinic, asked by staff, for a
 *      patient who will not fill it in themselves. Saved the same way as the
 *      patient's own, marked as taken at the clinic; once submitted, the
 *      plan is rebuilt from it and the blood report, as it is for theirs.
 *
 * Opened by contact id or chart id, like the other patient routes.
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

  return NextResponse.json({ intake: await getIntake(db, contactId) });
}

/** Only short strings and short lists of strings — the shape every answer has. */
function readAnswers(raw: unknown): IntakeAnswers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: IntakeAnswers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.length > 60) return null;
    if (typeof value === "string") {
      if (value.length > 2000) return null;
      out[key] = value;
    } else if (Array.isArray(value)) {
      if (value.length > 20 || !value.every((v) => typeof v === "string" && v.length <= 200)) return null;
      out[key] = value as string[];
    } else {
      return null;
    }
  }
  return out;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(PERMS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor((await params).id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { answers?: unknown; submit?: unknown } | null;
  const answers = readAnswers(body?.answers);
  if (!answers) return NextResponse.json({ error: "Those answers could not be read." }, { status: 400 });

  try {
    const intake = await saveIntake(db, {
      contactId,
      answers,
      step: 0,
      submit: body?.submit === true,
      actorUserId: context.session.user.id,
      source: "clinic",
    });
    // As on the patient's side: once submitted, the answers make the plan.
    if (intake.status === "submitted") {
      await refreshPatientPlan(db, contactId, { reason: "The questionnaire was answered at the clinic." }).catch((error) => {
        console.error("[plan] refresh after clinic questionnaire failed:", error);
      });
    }
    return NextResponse.json({ intake });
  } catch (error) {
    if (error instanceof IntakeValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

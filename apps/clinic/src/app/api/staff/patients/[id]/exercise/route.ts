import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, patientRecord } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import {
  activateExerciseProtocol,
  getExerciseProtocol,
  markExerciseSent,
  saveExerciseProtocol,
  setExerciseCheckIn,
} from "@workspace/db/exercise-protocol-store";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";
import { guardPatient } from "@/src/lib/auth/patient-scope";
import { exercisePlanUrl } from "@/src/lib/exercise-link";
import { sendExercisePlan } from "@/src/lib/exercise-plan-send";

/**
 * The doctor's exercise prescription for one patient.
 *
 * GET   { prescription, planUrl } — the saved prescription, or null, and the
 *       patient's no-login link to it (src/app/e/[token])
 * PUT   save the prescription (a new one is saved as a draft)
 * PATCH { activate: true } — make it final; nothing goes to the patient yet
 *       { send: true } — send it on WhatsApp: the sheet as a PDF and the link
 *       to the plan page; { whatsapp } says how it went
 *       { dailyCheckIn: boolean } — start or stop the daily WhatsApp check-in
 *
 * How the patient is keeping to it is the check-in log (../checkins).
 *
 * Written from the patient's record or from an appointment, so either
 * permission will do. The id may be the chart's or the contact's.
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
  return NextResponse.json({ prescription: await getExerciseProtocol(db, contactId), planUrl: exercisePlanUrl(contactId) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(PERMS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor((await params).id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  try {
    const saved = await saveExerciseProtocol(db, contactId, await req.json().catch(() => null), {
      id: context.session.user.id,
      name: context.session.user.name,
    });
    return NextResponse.json(saved);
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not save the prescription") }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(PERMS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor((await params).id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { activate?: unknown; send?: unknown; dailyCheckIn?: unknown } | null;
  const by = { id: context.session.user.id, name: context.session.user.name };
  try {
    if (body?.activate === true) {
      return NextResponse.json(await activateExerciseProtocol(db, contactId, by));
    }
    if (body?.send === true) {
      const whatsapp = await sendExercisePlan(contactId);
      const stored = whatsapp.sent ? await markExerciseSent(db, contactId, by) : await getExerciseProtocol(db, contactId);
      return NextResponse.json({ ...stored, whatsapp });
    }
    if (typeof body?.dailyCheckIn === "boolean") {
      return NextResponse.json(await setExerciseCheckIn(db, contactId, body.dailyCheckIn, by));
    }
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not update the prescription") }, { status: 400 });
  }
}

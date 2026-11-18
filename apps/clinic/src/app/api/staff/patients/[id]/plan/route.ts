import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { contact, patientRecord } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { getIntake } from "@workspace/db/patient-intake-store";
import { getPatientPlan, refreshPatientPlan, savePlanEdit } from "@workspace/db/diet-plan-store";
import { requireClinicApiAnyPermission, requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { guardPatient } from "@/src/lib/auth/patient-scope";

/**
 * A patient's personalised diet and supplement plan, for the nutritionist.
 *
 * GET    the plan as it stands (made from the rules now if there is none yet)
 * PUT    the nutritionist's edited version — from then on the rules leave it be
 * POST   { action: "regenerate" } — throw the edit away and let the rules
 *        remake it from the current report and answers
 *
 * The patient sees whatever is saved here, once they have submitted their
 * questionnaire.
 */

async function contactIdFor(id: string) {
  const chart = await db.query.patientRecord.findFirst({ where: eq(patientRecord.id, id) });
  return (
    chart?.contactId ??
    (await db.query.contact.findFirst({ columns: { id: true }, where: eq(contact.id, id) }))?.id ??
    null
  );
}

async function respond(contactId: string) {
  const intake = await getIntake(db, contactId);
  let plan = await getPatientPlan(db, contactId);
  if (!plan) plan = await refreshPatientPlan(db, contactId);
  return NextResponse.json({
    plan,
    // Whether the patient can see it yet: only once they have submitted.
    visibleToPatient: intake?.status === "submitted",
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(["clinic.patients", "clinic.appointments"]);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor((await params).id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });
  return respond(contactId);
}

const line = z.string().trim().min(1).max(400);
const lines = z.array(line).max(20);

const editSchema = z.object({
  diet: z.enum(["veg", "egg", "nonveg"]).nullable(),
  focus: z
    .array(
      z.object({
        key: z.string().max(60).optional(),
        title: z.string().trim().min(1).max(120),
        text: z.string().trim().max(600),
        domains: z.array(z.string().max(20)).max(20).optional(),
      }),
    )
    .max(12),
  supplements: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        reason: z.string().trim().max(400),
        caution: z.string().trim().max(400).optional(),
        domains: z.array(z.string().max(20)).max(20).optional(),
      }),
    )
    .max(12),
  meals: z.object({ breakfast: lines, lunch: lines, dinner: lines, snacks: lines }),
  drink: z.string().trim().max(400),
  avoid: lines,
  habits: lines,
  cautions: lines,
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiPermission("clinic.patients");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor((await params).id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  const parsed = editSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: `That plan could not be saved${issue ? ` — ${issue.path.join(" › ")}: ${issue.message}` : "."}` },
      { status: 400 },
    );
  }

  const edit = parsed.data;
  await savePlanEdit(
    db,
    contactId,
    {
      diet: edit.diet,
      focus: edit.focus.map((f, i) => ({ key: f.key || `edit_${i}`, title: f.title, text: f.text, domains: f.domains ?? [] })),
      supplements: edit.supplements.map((s) => ({
        name: s.name,
        reason: s.reason,
        domains: s.domains ?? [],
        ...(s.caution ? { caution: s.caution } : {}),
      })),
      meals: edit.meals,
      drink: edit.drink,
      avoid: edit.avoid,
      habits: edit.habits,
      cautions: edit.cautions,
    },
    { userId: context.session.user.id, name: context.session.user.name || context.session.user.email },
  );
  return respond(contactId);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiPermission("clinic.patients");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor((await params).id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== "regenerate") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const plan = await refreshPatientPlan(db, contactId, { force: true });
  if (!plan) {
    return NextResponse.json(
      { error: "There is no calculated blood report for this patient yet, so there is nothing to make a plan from." },
      { status: 409 },
    );
  }
  return respond(contactId);
}

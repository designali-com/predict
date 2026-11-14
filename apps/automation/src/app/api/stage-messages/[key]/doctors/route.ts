import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { communicationTemplate, user } from "@workspace/db/schema";
import { and, eq } from "@workspace/db";
import { removeDoctorTemplate, saveDoctorTemplate, stageTrigger } from "@workspace/db/stage-messages";
import { requirePermission } from "@/src/lib/auth/guards";

/**
 * One special-doctor template on a moment.
 *
 * POST   { doctorUserId, templateKey } — add or replace that person's template
 * DELETE { doctorUserId } — they go back to the moment's generic template
 */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await requirePermission("ops.flows");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await params;
  if (!stageTrigger(key)) return NextResponse.json({ error: "No such moment" }, { status: 404 });

  const body = ((await req.json().catch(() => null)) ?? {}) as { doctorUserId?: unknown; templateKey?: unknown };
  const doctorUserId = typeof body.doctorUserId === "string" ? body.doctorUserId : "";
  const templateKey = typeof body.templateKey === "string" ? body.templateKey : "";
  if (!doctorUserId || !templateKey) {
    return NextResponse.json({ error: "Choose a doctor and a template" }, { status: 400 });
  }

  const [person] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, doctorUserId))
    .limit(1);
  const role = person?.role?.toLowerCase();
  if (!person || (role !== "doctor" && role !== "nutritionist")) {
    return NextResponse.json({ error: "Choose a doctor or nutritionist" }, { status: 400 });
  }

  const [template] = await db
    .select()
    .from(communicationTemplate)
    .where(and(eq(communicationTemplate.key, templateKey), eq(communicationTemplate.channel, "whatsapp")))
    .limit(1);
  if (!template) return NextResponse.json({ error: "Choose a WhatsApp template" }, { status: 400 });
  const buttons = (Array.isArray(template.ctaButtons) ? template.ctaButtons : []) as { type?: string; url?: string }[];
  if (buttons.some((b) => b.type === "URL" && (b.url ?? "").includes("{{"))) {
    return NextResponse.json(
      { error: "This template's link button needs a value for each message, which stage messages can't fill yet." },
      { status: 400 },
    );
  }

  await saveDoctorTemplate(db, key, doctorUserId, templateKey);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await requirePermission("ops.flows");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await params;
  if (!stageTrigger(key)) return NextResponse.json({ error: "No such moment" }, { status: 404 });

  const body = ((await req.json().catch(() => null)) ?? {}) as { doctorUserId?: unknown };
  const doctorUserId = typeof body.doctorUserId === "string" ? body.doctorUserId : "";
  if (!doctorUserId) return NextResponse.json({ error: "Which doctor?" }, { status: 400 });

  await removeDoctorTemplate(db, key, doctorUserId);
  return NextResponse.json({ ok: true });
}

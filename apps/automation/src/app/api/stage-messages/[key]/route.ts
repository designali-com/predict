import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { communicationTemplate } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { saveStageRule, stageTrigger } from "@workspace/db/stage-messages";
import { requirePermission } from "@/src/lib/auth/guards";

/**
 * Save one moment: { enabled?, templateKey?, delayMinutes?, respectQuietHours? }.
 *
 * Templates are chosen here, never made or approved here — that is the
 * Templates page. So a template can only be switched on once Meta has
 * approved it, and never one whose link button needs a value per message.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await requirePermission("ops.flows");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await params;
  if (!stageTrigger(key)) return NextResponse.json({ error: "No such moment" }, { status: 404 });

  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const patch: Parameters<typeof saveStageRule>[2] = {};

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
    patch.enabled = body.enabled;
  }
  if (body.respectQuietHours !== undefined) {
    if (typeof body.respectQuietHours !== "boolean") {
      return NextResponse.json({ error: "respectQuietHours must be true or false" }, { status: 400 });
    }
    patch.respectQuietHours = body.respectQuietHours;
  }
  if (body.delayMinutes !== undefined) {
    const minutes = Number(body.delayMinutes);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 60 * 24 * 30) {
      return NextResponse.json({ error: "Delay must be between 0 and 30 days" }, { status: 400 });
    }
    patch.delayMinutes = minutes;
  }
  if (body.templateKey !== undefined) {
    if (body.templateKey !== null && typeof body.templateKey !== "string") {
      return NextResponse.json({ error: "templateKey must be a template key or null" }, { status: 400 });
    }
    patch.templateKey = (body.templateKey as string | null) || null;
  }

  // What it will be after this save, to check before switching anything on.
  const current = await db.query.stageMessageRule.findFirst({
    where: (r, { eq: is }) => is(r.triggerKey, key),
  });
  const templateKey = patch.templateKey !== undefined ? patch.templateKey : (current?.templateKey ?? null);
  const enabled = patch.enabled ?? current?.enabled ?? false;

  if (templateKey) {
    const [template] = await db
      .select()
      .from(communicationTemplate)
      .where(eq(communicationTemplate.key, templateKey))
      .limit(1);
    if (!template || template.channel !== "whatsapp") {
      return NextResponse.json({ error: "Choose a WhatsApp template" }, { status: 400 });
    }
    const buttons = (Array.isArray(template.ctaButtons) ? template.ctaButtons : []) as { type?: string; url?: string }[];
    if (buttons.some((b) => b.type === "URL" && (b.url ?? "").includes("{{"))) {
      return NextResponse.json(
        { error: "This template's link button needs a value for each message, which stage messages can't fill yet." },
        { status: 400 },
      );
    }
    if (enabled && template.submissionStatus !== "approved") {
      return NextResponse.json(
        { error: `"${template.name}" is ${template.submissionStatus} — it can be switched on once Meta approves it.` },
        { status: 400 },
      );
    }
  } else if (enabled) {
    return NextResponse.json({ error: "Choose a template before switching this on." }, { status: 400 });
  }

  const rule = await saveStageRule(db, key, patch, session.user.id);
  return NextResponse.json({ rule });
}

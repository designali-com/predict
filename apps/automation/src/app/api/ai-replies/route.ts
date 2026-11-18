import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { aiReplyConfig } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { AI_PROVIDERS, isAiProvider } from "@workspace/db/ai-providers";
import { requireClinicPermission } from "@/src/lib/auth/clinic";
import { aiReplyConfig as configTable } from "@workspace/db/schema";

/** This clinic's settings row, created on first use. */
async function readConfig(clinicId: string) {
  const [row] = await db.select().from(aiReplyConfig).where(eq(configTable.clinicId, clinicId)).limit(1);
  if (row) return row;
  const [created] = await db.insert(aiReplyConfig).values({ clinicId }).returning();
  return created!;
}

export async function GET() {
  const context = await requireClinicPermission("ops.ai_replies");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await readConfig(context.clinic.id);
  return NextResponse.json({
    config,
    providers: AI_PROVIDERS.map((p) => ({ value: p.value, label: p.label, models: p.models, envKey: p.envKey })),
    // Whether the key this provider needs is actually present on the server —
    // otherwise "enabled" is a switch that does nothing and only the worker
    // log would say why.
    keyPresent: {
      openai: !!process.env.OPENAI_API_KEY,
      google: !!process.env.GEMINI_API_KEY,
    },
    clinic: { id: context.clinic.id, name: context.clinic.name },
  });
}

export async function PATCH(req: Request) {
  const context = await requireClinicPermission("ops.ai_replies");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const existing = await readConfig(context.clinic.id);

  const provider = isAiProvider(b.provider) ? b.provider : existing.provider;
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const str = (v: unknown, fallback: string, max = 20000) =>
    typeof v === "string" ? v.slice(0, max) : fallback;

  const enabled = typeof b.enabled === "boolean" ? b.enabled : existing.enabled;
  const businessInfo = str(b.businessInfo, existing.businessInfo);
  // Switching it on with nothing written would produce an assistant allowed
  // to state no facts at all — every reply a hand-over.
  if (enabled && !businessInfo.trim()) {
    return NextResponse.json(
      { error: "Write what the clinic does, charges and when it opens before switching this on" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(aiReplyConfig)
    .set({
      enabled,
      provider,
      model: str(b.model, existing.model, 100),
      temperature: num(b.temperature, existing.temperature, 0, 1),
      maxOutputTokens: num(b.maxOutputTokens, existing.maxOutputTokens, 300, 4000),
      businessInfo,
      instructions: str(b.instructions, existing.instructions),
      dailyLimitPerContact: num(b.dailyLimitPerContact, existing.dailyLimitPerContact, 1, 50),
      humanTakeoverMinutes: num(b.humanTakeoverMinutes, existing.humanTakeoverMinutes, 0, 1440),
      handoffKeywords: str(b.handoffKeywords, existing.handoffKeywords, 2000),
      handoffCreatesTask:
        typeof b.handoffCreatesTask === "boolean" ? b.handoffCreatesTask : existing.handoffCreatesTask,
      updatedAt: new Date(),
    })
    .where(eq(aiReplyConfig.id, existing.id))
    .returning();

  return NextResponse.json({ config: updated });
}

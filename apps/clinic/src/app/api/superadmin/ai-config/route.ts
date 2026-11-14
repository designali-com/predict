import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { aiAssistantConfig } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { requireAdmin } from "@/src/lib/auth/require-admin";
import { AI_PROVIDERS, AI_PROVIDER_VALUES } from "@workspace/db/ai-providers";

const updateSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(AI_PROVIDER_VALUES),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().min(50).max(4000),
  additionalInstructions: z.string().max(4000),
  dailyMessageLimitPerUser: z.number().int().min(1).max(1000),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await db.query.aiAssistantConfig.findFirst();

  // Reported, not enforced, and asked of the patient app — the keys live in
  // its environment, not this one. Reading this process's env instead said
  // "no GEMINI_API_KEY" while the key sat in apps/web/.env, working. If the
  // patient app cannot be reached the answer is "unknown" (null), not "no".
  return NextResponse.json({ config, providerKeys: await patientAppKeys() });
}

async function patientAppKeys(): Promise<Record<string, boolean | null>> {
  const unknown = Object.fromEntries(AI_PROVIDERS.map((p) => [p.value, null]));
  const base = process.env.NEXT_PUBLIC_PATIENT_URL;
  if (!base) return unknown;
  try {
    const res = await fetch(new URL("/api/public/ai-status", base), {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return unknown;
    const data = (await res.json()) as { providers?: Record<string, boolean> };
    return { ...unknown, ...(data.providers ?? {}) };
  } catch {
    return unknown;
  }
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await db.query.aiAssistantConfig.findFirst();
  if (!existing) {
    return NextResponse.json({ error: "Config not found — run the seed script first" }, { status: 500 });
  }

  const [config] = await db
    .update(aiAssistantConfig)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(aiAssistantConfig.id, existing.id))
    .returning();

  return NextResponse.json({ config });
}

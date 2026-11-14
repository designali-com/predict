import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { leadRule } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { requirePermission } from "@/src/lib/auth/guards";
import { parseRule } from "../parse";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.lead_routing");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = parseRule(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const [rule] = await db
    .update(leadRule)
    .set({ ...parsed.value, updatedAt: new Date() })
    .where(eq(leadRule.id, id))
    .returning();
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ rule });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.lead_routing");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.delete(leadRule).where(eq(leadRule.id, id));
  return NextResponse.json({ ok: true });
}

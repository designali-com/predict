import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { biomarkerDomain } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { requireAdmin } from "@/src/lib/auth/require-admin"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  shortCode: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const [domain] = await db
      .update(biomarkerDomain)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(biomarkerDomain.id, id))
      .returning();

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    return NextResponse.json({ domain });
  } catch (error: any) {
    const message = error?.code === "23505" ? "Short code already exists" : "Failed to update domain";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await db.delete(biomarkerDomain).where(eq(biomarkerDomain.id, id));

  return NextResponse.json({ success: true });
}

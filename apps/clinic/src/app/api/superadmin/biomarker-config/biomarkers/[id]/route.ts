import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { biomarker } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { requireAdmin } from "@/src/lib/auth/require-admin";

const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((val) => {
    if (val === "" || val === null || val === undefined) return null;
    const num = Number(val);
    return Number.isNaN(num) ? null : num;
  });

/** Whole paise. See the create route — a fractional paise drifts every total. */
const paise = z
  .union([z.string(), z.number()])
  .optional()
  .transform((val) => {
    if (val === "" || val === undefined) return undefined;
    const num = Number(val);
    return Number.isFinite(num) && num > 0 ? Math.round(num) : 0;
  });

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  shortCode: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  rangeMin: optionalNumber,
  rangeMax: optionalNumber,
  direction: z.boolean().optional(),
  priceInPaise: paise,
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

  const [updated] = await db
    .update(biomarker)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(biomarker.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Biomarker not found" }, { status: 404 });
  }

  return NextResponse.json({ biomarker: updated });
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
  await db.delete(biomarker).where(eq(biomarker.id, id));

  return NextResponse.json({ success: true });
}

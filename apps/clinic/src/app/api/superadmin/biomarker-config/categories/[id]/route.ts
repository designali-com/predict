import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { biomarkerIndex } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { requireAdmin } from "@/src/lib/auth/require-admin";
import { RISK_LABELS, validateRiskBands } from "@workspace/db/risk-bands";

const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    const num = Number(val);
    return Number.isNaN(num) ? undefined : num;
  });


// Validated again here, not only in the editor: the API is reachable without
// it, and a saved band list that cannot classify a score is worse than a
// rejected one.
const riskBandsSchema = z
  .array(
    z.object({
      label: z.enum(RISK_LABELS),
      min: z.number(),
      max: z.number().nullable(),
    }),
  )
  .optional()
  .superRefine((bands, ctx) => {
    const problem = bands ? validateRiskBands(bands) : null;
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  shortCode: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  k: optionalNumber,
  riskBands: riskBandsSchema,
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
    const [category] = await db
      .update(biomarkerIndex)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(biomarkerIndex.id, id))
      .returning();

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    return NextResponse.json({ category });
  } catch (error: any) {
    const message = error?.code === "23505" ? "Short code already exists" : "Failed to update category";
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
  await db.delete(biomarkerIndex).where(eq(biomarkerIndex.id, id));

  return NextResponse.json({ success: true });
}

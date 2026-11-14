import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { biomarkerIndex } from "@workspace/db/schema";
import { desc } from "@workspace/db";
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

const createSchema = z.object({
  name: z.string().min(1),
  shortCode: z.string().min(1),
  description: z.string().optional().nullable(),
  k: optionalNumber,
  riskBands: riskBandsSchema,
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await db.query.biomarkerIndex.findMany({
    orderBy: [desc(biomarkerIndex.createdAt)],
  });

  return NextResponse.json({ categories });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const [category] = await db
      .insert(biomarkerIndex)
      .values(parsed.data)
      .returning();

    return NextResponse.json({ category }, { status: 201 });
  } catch (error: any) {
    const message = error?.code === "23505" ? "Short code already exists" : "Failed to create category";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { biomarker } from "@workspace/db/schema";
import { desc } from "@workspace/db";
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

/**
 * Money, always a whole number of paise.
 *
 * Rounded rather than trusted: a fractional paise would be stored by the
 * driver as a float and every total built from it would drift.
 */
const paise = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((val) => {
    if (val === "" || val === null || val === undefined) return 0;
    const num = Number(val);
    return Number.isFinite(num) && num > 0 ? Math.round(num) : 0;
  });

const createSchema = z.object({
  name: z.string().min(1),
  shortCode: z.string().min(1),
  description: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  rangeMin: optionalNumber,
  rangeMax: optionalNumber,
  direction: z.boolean(),
  priceInPaise: paise,
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const biomarkers = await db.query.biomarker.findMany({
    orderBy: [desc(biomarker.createdAt)],
  });

  return NextResponse.json({ biomarkers });
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

  const [created] = await db.insert(biomarker).values(parsed.data).returning();

  return NextResponse.json({ biomarker: created }, { status: 201 });
}

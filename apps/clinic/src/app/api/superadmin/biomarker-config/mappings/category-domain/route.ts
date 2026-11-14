import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { indexDomainMap } from "@workspace/db/schema";
import { and, eq } from "@workspace/db";
import { requireAdmin } from "@/src/lib/auth/require-admin";
import { RISK_LABELS, validateRiskBands } from "@workspace/db/risk-bands";

const mapSchema = z.object({
  categoryId: z.string().min(1),
  domainId: z.string().min(1),
  riskBands: z
    .array(
      z.object({
        label: z.enum(RISK_LABELS),
        min: z.number(),
        max: z.number().nullable(),
      }),
    )
    .optional()
    .superRefine((bands, ctx) => {
      // Checked here as well as in the editor: the API is reachable without it,
      // and a saved band list that cannot classify a score is worse than a
      // rejected one.
      const problem = bands ? validateRiskBands(bands) : null;
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mappings = await db.query.indexDomainMap.findMany();

  return NextResponse.json({ mappings });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = mapSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { categoryId, ...rest } = parsed.data;
  const [mapping] = await db
    .insert(indexDomainMap)
    // The request field is still called categoryId; indexId is the column.
    .values({ indexId: categoryId, ...rest })
    .onConflictDoUpdate({
      target: [indexDomainMap.indexId, indexDomainMap.domainId],
      set: {
        riskBands: parsed.data.riskBands ?? [],
      },
    })
    .returning();

  return NextResponse.json({ mapping }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const categoryId = searchParams.get("categoryId");
  const domainId = searchParams.get("domainId");

  if (!categoryId || !domainId) {
    return NextResponse.json(
      { error: "categoryId and domainId are required" },
      { status: 400 },
    );
  }

  await db
    .delete(indexDomainMap)
    .where(
      and(
        eq(indexDomainMap.indexId, categoryId),
        eq(indexDomainMap.domainId, domainId),
      ),
    );

  return NextResponse.json({ success: true });
}

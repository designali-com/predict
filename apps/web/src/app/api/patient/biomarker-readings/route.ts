import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { biomarker, biomarkerReading } from "@workspace/db/schema";
import { canReadAnotherPatient } from "@/src/lib/auth/config";
import { auth } from "@/src/lib/auth/auth";
import { headers } from "next/headers";
import { desc, eq, inArray } from "@workspace/db";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedUserId = request.nextUrl.searchParams.get("userId");
  const userId = requestedUserId || session.user.id;

  if (userId !== session.user.id && !canReadAnotherPatient()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readings = await db.query.biomarkerReading.findMany({
    where: eq(biomarkerReading.userId, userId),
    orderBy: [desc(biomarkerReading.recordedAt)],
  });

  const biomarkerIds = [...new Set(readings.map((r) => r.biomarkerId))];
  const biomarkers =
    biomarkerIds.length > 0
      ? await db.query.biomarker.findMany({ where: inArray(biomarker.id, biomarkerIds) })
      : [];
  const biomarkerById = new Map(biomarkers.map((b) => [b.id, b]));

  return NextResponse.json({
    readings: readings.map((r) => ({
      ...r,
      biomarkerName: biomarkerById.get(r.biomarkerId)?.name ?? null,
      biomarkerShortCode: biomarkerById.get(r.biomarkerId)?.shortCode ?? null,
    })),
  });
}

const bodySchema = z.object({
  userId: z.string().min(1),
  reportId: z.string().optional().nullable(),
  readings: z
    .array(
      z.object({
        biomarkerId: z.string().min(1),
        value: z.number(),
      }),
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !canReadAnotherPatient()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { userId, reportId, readings } = parsed.data;

  const inserted = await db
    .insert(biomarkerReading)
    .values(
      readings.map((r) => ({
        userId,
        reportId: reportId ?? null,
        biomarkerId: r.biomarkerId,
        value: r.value,
      })),
    )
    .returning();

  return NextResponse.json({ readings: inserted }, { status: 201 });
}

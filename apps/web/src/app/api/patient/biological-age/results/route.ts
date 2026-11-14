import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/src/lib/auth/auth";
import { headers } from "next/headers";
import { canReadAnotherPatient } from "@/src/lib/auth/config";
import { db } from "@workspace/db/client";
import { biologicalAgeResult, domainAgeResult } from "@workspace/db/schema";
import { and, desc, eq, inArray } from "@workspace/db";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const requestedUserId = searchParams.get("userId");
  const categoryId = searchParams.get("categoryId");
  const userId = requestedUserId || session.user.id;

  if (userId !== session.user.id && !canReadAnotherPatient()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conditions = [eq(biologicalAgeResult.userId, userId)];
  if (categoryId) {
    conditions.push(eq(biologicalAgeResult.indexId, categoryId));
  }

  const results = await db.query.biologicalAgeResult.findMany({
    where: and(...conditions),
    orderBy: [desc(biologicalAgeResult.calculatedAt)],
  });

  const resultIds = results.map((r) => r.id);
  const domainResults =
    resultIds.length > 0
      ? await db.query.domainAgeResult.findMany({
          where: inArray(domainAgeResult.resultId, resultIds),
        })
      : [];

  const domainResultsByResultId = domainResults.reduce(
    (acc, d) => {
      const existing = acc[d.resultId] ?? [];
      existing.push(d);
      acc[d.resultId] = existing;
      return acc;
    },
    {} as Record<string, typeof domainResults>,
  );

  return NextResponse.json({
    results: results.map((r) => ({
      ...r,
      domainResults: domainResultsByResultId[r.id] ?? [],
    })),
  });
}

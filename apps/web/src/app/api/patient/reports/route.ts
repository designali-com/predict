import { withReadableUrls } from "@workspace/storage";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import { report } from "@workspace/db/schema";
import { desc, eq } from "@workspace/db";
import { canReadAnotherPatient } from "@/src/lib/auth/config";

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

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, 200)
    : 100;

  const reports = await db.query.report.findMany({
    where: eq(report.userId, userId),
    orderBy: [desc(report.uploadedAt)],
    limit,
  });

  return NextResponse.json({ reports: await withReadableUrls(reports) });
}
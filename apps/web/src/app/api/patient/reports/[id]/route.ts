import { readableUrl } from "@workspace/storage";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import { report } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { canReadAnotherPatient } from "@/src/lib/auth/config";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const reportRow = await db.query.report.findFirst({
    where: eq(report.id, id),
  });

  if (!reportRow) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (
    reportRow.userId !== session.user.id &&
    !canReadAnotherPatient()
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ report: { ...reportRow, fileUrl: await readableUrl(reportRow.fileUrl) } });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { domainBiomarkerMap } from "@workspace/db/schema";
import { and, eq } from "@workspace/db";
import { requireAdmin } from "@/src/lib/auth/require-admin";

const mapSchema = z.object({
  domainId: z.string().min(1),
  biomarkerId: z.string().min(1),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mappings = await db.query.domainBiomarkerMap.findMany();

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

  try {
    const [mapping] = await db
      .insert(domainBiomarkerMap)
      .values(parsed.data)
      .returning();

    return NextResponse.json({ mapping }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "23505") {
      return NextResponse.json({ success: true, alreadyExists: true });
    }
    return NextResponse.json({ error: "Failed to map biomarker" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const domainId = searchParams.get("domainId");
  const biomarkerId = searchParams.get("biomarkerId");

  if (!domainId || !biomarkerId) {
    return NextResponse.json(
      { error: "domainId and biomarkerId are required" },
      { status: 400 },
    );
  }

  await db
    .delete(domainBiomarkerMap)
    .where(
      and(
        eq(domainBiomarkerMap.domainId, domainId),
        eq(domainBiomarkerMap.biomarkerId, biomarkerId),
      ),
    );

  return NextResponse.json({ success: true });
}

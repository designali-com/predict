import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { biomarkerDomain } from "@workspace/db/schema";
import { desc } from "@workspace/db";
import { requireAdmin } from "@/src/lib/auth/require-admin";

const createSchema = z.object({
  name: z.string().min(1),
  shortCode: z.string().min(1),
  description: z.string().optional().nullable(),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const domains = await db.query.biomarkerDomain.findMany({
    orderBy: [desc(biomarkerDomain.createdAt)],
  });

  return NextResponse.json({ domains });
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
    const [domain] = await db.insert(biomarkerDomain).values(parsed.data).returning();

    return NextResponse.json({ domain }, { status: 201 });
  } catch (error: any) {
    const message = error?.code === "23505" ? "Short code already exists" : "Failed to create domain";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

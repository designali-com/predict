import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { audience, audienceMember } from "@workspace/db/schema";
import { eq, desc, count } from "@workspace/db";
import { requirePermission } from "@/src/lib/auth/guards";

export async function GET() {
  const session = await requirePermission("ops.audiences");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: audience.id,
      name: audience.name,
      description: audience.description,
      createdAt: audience.createdAt,
      memberCount: count(audienceMember.id),
    })
    .from(audience)
    .leftJoin(audienceMember, eq(audienceMember.audienceId, audience.id))
    .groupBy(audience.id)
    .orderBy(desc(audience.createdAt));

  return NextResponse.json({ audiences: rows });
}

export async function POST(req: Request) {
  const session = await requirePermission("ops.audiences");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : null;
  const memberContactIds: string[] = Array.isArray(body?.memberContactIds)
    ? body.memberContactIds.filter((id: unknown) => typeof id === "string")
    : [];

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [row] = await db.insert(audience).values({ name, description }).returning();

  if (memberContactIds.length > 0) {
    await db
      .insert(audienceMember)
      .values(memberContactIds.map((contactId) => ({ audienceId: row!.id, contactId })))
      .onConflictDoNothing();
  }

  return NextResponse.json({ id: row!.id }, { status: 201 });
}

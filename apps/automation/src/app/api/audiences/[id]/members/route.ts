import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { audienceMember } from "@workspace/db/schema";
import { and, eq } from "@workspace/db";
import { requirePermission } from "@/src/lib/auth/guards";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.audiences");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const contactIds: string[] = Array.isArray(body?.contactIds)
    ? body.contactIds.filter((c: unknown) => typeof c === "string")
    : [];

  if (contactIds.length === 0) {
    return NextResponse.json({ error: "contactIds is required" }, { status: 400 });
  }

  await db
    .insert(audienceMember)
    .values(contactIds.map((contactId) => ({ audienceId: id, contactId })))
    .onConflictDoNothing();

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.audiences");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const contactId = typeof body?.contactId === "string" ? body.contactId : undefined;
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });

  await db
    .delete(audienceMember)
    .where(and(eq(audienceMember.audienceId, id), eq(audienceMember.contactId, contactId)));

  return NextResponse.json({ success: true });
}

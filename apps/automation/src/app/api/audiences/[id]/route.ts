import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { audience, audienceMember, contact } from "@workspace/db/schema";
import { eq, desc } from "@workspace/db";
import { requirePermission } from "@/src/lib/auth/guards";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.audiences");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [row] = await db.select().from(audience).where(eq(audience.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const members = await db
    .select({
      contactId: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      status: contact.stage,
      addedAt: audienceMember.addedAt,
    })
    .from(audienceMember)
    .innerJoin(contact, eq(audienceMember.contactId, contact.id))
    .where(eq(audienceMember.audienceId, id))
    .orderBy(desc(audienceMember.addedAt));

  return NextResponse.json({ audience: row, members });
}

import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact } from "@workspace/db/schema";
import { desc } from "@workspace/db";
import { requireOperations } from "@/src/lib/auth/guards";

export async function GET() {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contacts = await db.select().from(contact).orderBy(desc(contact.createdAt)).limit(500);
  return NextResponse.json({ contacts });
}

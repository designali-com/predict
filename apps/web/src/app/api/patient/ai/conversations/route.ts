import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import { aiConversation } from "@workspace/db/schema";
import { desc, eq } from "@workspace/db";

// GET: list the current patient's chat threads (id, title, updatedAt) for
// the history sidebar on /dashboard/ai. Always scoped to the session user.
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await db.query.aiConversation.findMany({
    where: eq(aiConversation.userId, session.user.id),
    orderBy: [desc(aiConversation.updatedAt)],
    columns: { id: true, title: true, updatedAt: true, createdAt: true },
  });

  return NextResponse.json({ conversations });
}

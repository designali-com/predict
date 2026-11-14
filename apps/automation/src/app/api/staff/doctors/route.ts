import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { user } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { requireOperations } from "@/src/lib/auth/guards";

export async function GET() {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doctors = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.role, "doctor"));

  return NextResponse.json({ doctors });
}
